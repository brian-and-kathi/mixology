// Integration test: starts `wrangler dev` on a spare port with a throwaway
// secret and state directory, then exercises the HTTP and WebSocket surface.
// Run: npm test   (Node 22+, which has a global WebSocket)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import http from "node:http";

const PORT = Number(process.env.RELAY_TEST_PORT ?? 8795);
const BASE = `http://127.0.0.1:${PORT}`;
const WS = `ws://127.0.0.1:${PORT}`;
const SECRET = randomBytes(24).toString("hex");
const dir = mkdtempSync(join(tmpdir(), "relay-test-"));
let proc;

async function startRelay() {
  writeFileSync(join(dir, "env"), `RELAY_SECRET="${SECRET}"\nALLOWED_ORIGINS="https://allowed.example"\n`);
  proc = spawn(
    "npx",
    ["wrangler", "dev", "--port", String(PORT), "--ip", "127.0.0.1", "--env-file", join(dir, "env"),
      "--persist-to", join(dir, "state"), "--show-interactive-dev-session=false"],
    { stdio: ["ignore", "pipe", "pipe"], detached: true },
  );
  let log = "";
  proc.stdout.on("data", (d) => (log += d));
  proc.stderr.on("data", (d) => (log += d));
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${BASE}/health`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("relay did not start:\n" + log);
}

function stopRelay() {
  if (proc && proc.exitCode === null) process.kill(-proc.pid, "SIGTERM");
}

const publish = (body, token = SECRET) =>
  fetch(`${BASE}/publish`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

/** Status of a raw upgrade attempt (fetch refuses to send an Upgrade header). */
function upgradeStatus(topic) {
  return new Promise((resolve, reject) => {
    const req = http.get(`${BASE}/ws?topic=${encodeURIComponent(topic)}`, {
      headers: { connection: "Upgrade", upgrade: "websocket", "sec-websocket-version": "13",
        "sec-websocket-key": randomBytes(16).toString("base64") },
    });
    req.on("response", (res) => { res.resume(); resolve(res.statusCode); });
    req.on("upgrade", (res, socket) => { socket.destroy(); resolve(101); });
    req.on("error", reject);
  });
}

/** Open a socket and collect messages; resolves once open. */
function connect(topic, headers) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS}/ws?topic=${encodeURIComponent(topic)}`, headers ? { headers } : undefined);
    const messages = [];
    const waiters = [];
    ws.addEventListener("message", (e) => {
      const msg = String(e.data) === "pong" ? "pong" : JSON.parse(String(e.data));
      messages.push(msg);
      waiters.splice(0).forEach((w) => w());
    });
    ws.addEventListener("open", () => resolve({ ws, messages, next }));
    ws.addEventListener("error", () => reject(new Error("socket error")));
    async function next(pred = () => true, ms = 5000) {
      const t0 = Date.now();
      for (;;) {
        const hit = messages.find(pred);
        if (hit) { messages.splice(messages.indexOf(hit), 1); return hit; }
        if (Date.now() - t0 > ms) throw new Error("timeout waiting for message; have " + JSON.stringify(messages));
        await new Promise((r) => { waiters.push(r); setTimeout(r, 100); });
      }
    }
  });
}

before(startRelay, { timeout: 70_000 });
after(() => { stopRelay(); rmSync(dir, { recursive: true, force: true }); });

test("health", async () => {
  const r = await fetch(`${BASE}/health`);
  assert.equal(r.status, 200);
});

test("publish rejects a bad or missing secret", async () => {
  assert.equal((await publish({ topic: "bar:cast", kind: "cast" }, "nope")).status, 401);
  const r = await fetch(`${BASE}/publish`, { method: "POST", body: "{}" });
  assert.equal(r.status, 401);
});

test("publish validates topic, kind, version and size", async () => {
  assert.equal((await publish({ topic: "bar:secret", kind: "cast" })).status, 403);
  assert.equal((await publish({ topic: "bar:cast", kind: "Bad Kind!" })).status, 400);
  assert.equal((await publish({ topic: "bar:cast", kind: "cast", version: -1 })).status, 400);
  assert.equal((await publish("not json")).status, 400);
  assert.equal((await publish({ topic: "bar:cast", kind: "cast", pad: "x".repeat(2000) })).status, 413);
});

test("socket rejects unknown topics, non-upgrades and foreign origins", async () => {
  assert.equal((await fetch(`${BASE}/ws?topic=bar:cast`)).status, 426);
  assert.equal(await upgradeStatus("nope"), 403);
  await assert.rejects(connect("bar:cast", { origin: "https://evil.example" }));
});

test("hello on connect, notice on publish, catch-up on reconnect", async () => {
  const a = await connect("bar:cast", { origin: "https://allowed.example" });
  const hello = await a.next((m) => m.type === "hello");
  assert.equal(hello.topic, "bar:cast");

  const t0 = Date.now();
  const res = await publish({ topic: "bar:cast", kind: "cast" });
  assert.equal(res.status, 200);
  const { version } = await res.json();
  const notice = await a.next((m) => m.type === "notice");
  console.log(`  publish -> notice in ${Date.now() - t0} ms`);
  assert.deepEqual(notice, { type: "notice", topic: "bar:cast", version, kind: "cast" });
  assert.ok(version > hello.version);

  // Topics are isolated.
  const m = await connect("bar:menu");
  await m.next((x) => x.type === "hello");
  await publish({ topic: "bar:menu", kind: "stock" });
  await m.next((x) => x.type === "notice" && x.kind === "stock");
  // bar:status (Open/Closed) is on the allowlist too.
  const s = await connect("bar:status");
  await s.next((x) => x.type === "hello");
  assert.equal((await publish({ topic: "bar:status", kind: "close" })).status, 200);
  await s.next((x) => x.type === "notice" && x.topic === "bar:status" && x.kind === "close");
  s.ws.close();
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(a.messages.filter((x) => x.type === "notice").length, 0);

  // Heartbeat is auto-answered.
  a.ws.send("ping");
  assert.equal(await a.next((x) => x === "pong"), "pong");

  // Miss a publish while disconnected; the next hello carries the new version.
  a.ws.close();
  m.ws.close();
  const res2 = await publish({ topic: "bar:cast", kind: "clear", version: Date.now() });
  const v2 = (await res2.json()).version;
  assert.ok(v2 > version);
  const b = await connect("bar:cast");
  const hello2 = await b.next((x) => x.type === "hello");
  assert.equal(hello2.version, v2);
  assert.equal(hello2.kind, "clear");
  b.ws.close();
});

test("oversize client message closes the socket", async () => {
  const c = await connect("bar:cast");
  await c.next((x) => x.type === "hello");
  const closed = new Promise((r) => c.ws.addEventListener("close", (e) => r(e.code)));
  c.ws.send("x".repeat(200));
  assert.equal(await closed, 1009);
});
