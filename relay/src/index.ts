/**
 * Mixology realtime relay.
 *
 * A minimal pub/sub for "something changed" notices. It never carries app
 * data: a notice is {topic, version, kind}, and clients refetch through the
 * app's normal API when they see one.
 *
 *   GET  /ws?topic=bar:cast     WebSocket upgrade (browser clients)
 *   POST /publish               {topic, version?, kind}, Bearer RELAY_SECRET
 *   GET  /health                "ok"
 *
 * One Durable Object instance per topic (SQLite-backed, WebSocket Hibernation
 * API). The DO keeps the latest version per topic and sends it on connect,
 * so a reconnecting client can tell whether it missed anything.
 */
import { DurableObject } from "cloudflare:workers";

/** Topics the relay accepts. Anything else is rejected before a DO is touched. */
export const TOPICS = new Set(["bar:cast", "bar:menu"]);

const KIND_RE = /^[a-z][a-z0-9_-]{0,31}$/;
const MAX_PUBLISH_BYTES = 1024;
const MAX_CLIENT_MESSAGE_BYTES = 64;
const MAX_SOCKETS_PER_TOPIC = 500;

export interface Notice {
  type: "hello" | "notice";
  topic: string;
  version: number;
  kind: string;
}

// ---------------------------------------------------------------------------
// Durable Object: one per topic
// ---------------------------------------------------------------------------

export class Topic extends DurableObject<Env> {
  private state: { version: number; kind: string };

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Heartbeats are answered by the runtime without waking the object.
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS state (
         id INTEGER PRIMARY KEY CHECK (id = 1),
         topic TEXT NOT NULL,
         version INTEGER NOT NULL,
         kind TEXT NOT NULL,
         at INTEGER NOT NULL
       )`,
    );
    const row = this.ctx.storage.sql
      .exec<{ version: number; kind: string }>("SELECT version, kind FROM state WHERE id = 1")
      .toArray()[0];
    this.state = row ? { version: row.version, kind: row.kind } : { version: 0, kind: "none" };
  }

  /** WebSocket upgrade, forwarded by the Worker after validation. */
  async fetch(request: Request): Promise<Response> {
    const topic = new URL(request.url).searchParams.get("topic") ?? "";
    if (this.ctx.getWebSockets().length >= MAX_SOCKETS_PER_TOPIC) {
      return new Response("too many connections", { status: 503 });
    }
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ topic });
    // Catch-up: tell the client where the topic is right now.
    server.send(JSON.stringify(this.message("hello", topic)));
    return new Response(null, { status: 101, webSocket: client });
  }

  /** RPC from the Worker's /publish handler. Returns the stored version. */
  async publish(topic: string, kind: string, version?: number): Promise<number> {
    const next = Math.max(this.state.version + 1, Number.isSafeInteger(version) ? (version as number) : 0);
    this.state = { version: next, kind };
    this.ctx.storage.sql.exec(
      `INSERT INTO state (id, topic, version, kind, at) VALUES (1, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET topic = excluded.topic, version = excluded.version,
         kind = excluded.kind, at = excluded.at`,
      topic,
      next,
      kind,
      Date.now(),
    );
    const payload = JSON.stringify(this.message("notice", topic));
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(payload);
      } catch {
        // Socket is closing; the runtime will call webSocketClose/Error.
      }
    }
    return next;
  }

  /** Clients only send "ping" (auto-answered). Anything else is ignored; oversize closes. */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const size = typeof message === "string" ? message.length : message.byteLength;
    if (size > MAX_CLIENT_MESSAGE_BYTES) ws.close(1009, "message too big");
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    // Reserved codes (1005/1006) can't be echoed back.
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, reason);
    } catch {
      /* already closed */
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    try {
      ws.close(1011, "error");
    } catch {
      /* already closed */
    }
  }

  private message(type: Notice["type"], topic: string): Notice {
    return { type, topic, version: this.state.version, kind: this.state.kind };
  }
}

// ---------------------------------------------------------------------------
// Worker: validation and routing
// ---------------------------------------------------------------------------

function text(body: string, status: number, extra?: HeadersInit): Response {
  return new Response(body, { status, headers: { "content-type": "text/plain", ...extra } });
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function originAllowed(origin: string | null, allowed: string | undefined): boolean {
  const list = (allowed ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length === 0 || list.includes("*")) return true;
  // Non-browser clients send no Origin; they can't be the page we're protecting.
  if (!origin) return true;
  return list.includes(origin);
}

/** Constant-time bearer check: hash both sides so lengths always match. */
async function secretMatches(provided: string, expected: string | undefined): Promise<boolean> {
  if (!expected) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(provided)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

async function handlePublish(request: Request, env: Env): Promise<Response> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!(await secretMatches(token, env.RELAY_SECRET))) return text("unauthorized", 401);

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_PUBLISH_BYTES) return text("payload too large", 413);
  const raw = await request.text();
  if (raw.length > MAX_PUBLISH_BYTES) return text("payload too large", 413);

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return text("invalid json", 400);
  }
  const { topic, kind, version } = (body ?? {}) as Record<string, unknown>;
  if (typeof topic !== "string" || !TOPICS.has(topic)) return text("unknown topic", 403);
  if (typeof kind !== "string" || !KIND_RE.test(kind)) return text("invalid kind", 400);
  if (version !== undefined && (typeof version !== "number" || !Number.isSafeInteger(version) || version < 0)) {
    return text("invalid version", 400);
  }

  const stored = await env.TOPIC.getByName(topic).publish(topic, kind, version as number | undefined);
  return json({ ok: true, topic, version: stored });
}

async function handleSocket(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return text("expected websocket upgrade", 426, { upgrade: "websocket" });
  }
  const topic = url.searchParams.get("topic") ?? "";
  if (!TOPICS.has(topic)) return text("unknown topic", 403);
  if (!originAllowed(request.headers.get("origin"), env.ALLOWED_ORIGINS)) {
    return text("origin not allowed", 403);
  }
  return env.TOPIC.getByName(topic).fetch(request);
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/ws" && request.method === "GET") return handleSocket(request, env, url);
    if (url.pathname === "/publish" && request.method === "POST") return handlePublish(request, env);
    if (url.pathname === "/health" && request.method === "GET") return text("ok", 200);
    return text("not found", 404);
  },
} satisfies ExportedHandler<Env>;
