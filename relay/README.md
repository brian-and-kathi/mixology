# mixology-relay

A tiny Cloudflare Worker that tells the bar app's screens *when* to refetch. When someone
casts a drink or marks a bottle out, the app publishes a "changed" notice here. The TV and
phones hear it over a WebSocket and refetch through the app's normal API. Without the relay,
screens poll (the TV every 4 s). With it, a cast reaches the TV in well under a second and
idle screens barely touch the app or the database.

The relay **never carries app data**, only `{topic, version, kind}`. If it's down, the app
works exactly as before (clients fall back to polling). If `RELAY_URL` is unset in the app,
nothing connects to it at all.

## API

| Route | Who | What |
|---|---|---|
| `GET /ws?topic=bar:cast` | browsers | WebSocket upgrade. The first message is `{"type":"hello","topic","version","kind"}` with the topic's latest state, then `{"type":"notice",...}` on every publish. Send `ping` to get `pong` (heartbeat). |
| `POST /publish` | the app server | `Authorization: Bearer <RELAY_SECRET>`, body `{"topic":"bar:cast","kind":"cast","version":1790000000000}` (version optional). Answers `{"ok":true,"topic","version"}` with the stored version. |
| `GET /health` | anyone | `ok` |

**Topics (allowlist in `src/index.ts`):**

- `bar:cast`: cast started, replaced or cleared. Heard by the TV, pour and recipe pages, and the admin Clear TV status.
- `bar:menu`: stock, bottles, recipes, specs, substitutions, `/db` edits and ratings. Heard by the TV board.
- `bar:status`: the bar opened or closed (kind `open` / `close`). Heard by guest phone pages, the TV, the knock page, the lounge and the admin menu's switch; they refetch `GET /api/bar/status`. (Adding a topic needs a Worker redeploy; `bar:status` has been live since 2026-09-28.)

**Limits:**
- Publish bodies are at most 1 KB, and `kind` must match `^[a-z][a-z0-9_-]{0,31}$`.
- Client messages are at most 64 B (larger closes the socket with 1009).
- At most 500 sockets per topic.
- Origins outside `ALLOWED_ORIGINS` get 403. Empty or `*` allows any origin; requests with no Origin (non-browser clients) are allowed.

**Errors:** 401 bad secret, 403 unknown topic or origin, 400 bad JSON/kind/version,
413 too large, 426 not a WebSocket upgrade.

## How it works

- `src/index.ts`: the Worker validates everything (secret, topic, size, origin) and only then
  forwards to the topic's Durable Object: `env.TOPIC.getByName(topic)`.
- `Topic` Durable Object, one instance per topic:
  - Uses SQLite storage and the WebSocket Hibernation API (`ctx.acceptWebSocket`), so idle sockets cost nothing and survive the object being evicted.
  - Keeps one row with the latest `version`/`kind`. A publish stores `max(previous + 1, publisher's version)` (the app sends `Date.now()`, so versions stay monotonic even if state were lost), then broadcasts.
  - On connect it sends `hello` with the stored version: a client that reconnects compares it with the last version it saw and refetches if it differs, so nothing is missed while away.
  - `ping`/`pong` is set up with `setWebSocketAutoResponse`, so heartbeats don't wake the object.
- A deploy disconnects every socket. Clients reconnect (backoff with jitter, 1 s → 15 s) and
  poll at the old rates until they do.

App side (repo root):
- `src/lib/relay.ts`: `publish(topic, kind)`, fire-and-forget: runs after the response via `after()`, has a 1.5 s timeout, and never throws.
- `src/lib/relay-client.ts` and `src/lib/use-relay.ts`: the shared socket per topic, reconnects, and heartbeat, plus the hook that slows polling to a 6-minute fallback while the socket is live.
- The root layout renders `<meta name="relay-url">` only when `RELAY_URL` is set.

## Local development

Wrangler needs Node 22+ (on the box: `export PATH=~/.local/opt/node22/bin:$PATH`).

```sh
cd relay
npm ci
cp .dev.vars.example .dev.vars      # then put a random RELAY_SECRET in it (openssl rand -hex 32)
npx wrangler dev --port 8795         # relay on http://127.0.0.1:8795
npm test                             # starts its own wrangler dev on :8795 (RELAY_TEST_PORT to change)
npm run typecheck                    # wrangler types + tsc
```

Run the app against it with `RELAY_URL=http://127.0.0.1:8795` and `RELAY_SECRET=<same value>`
in the app's environment.

## Deployed

Live since 2026-09-27 at `https://mixology-relay.brian-952.workers.dev` (Brian's Cloudflare
account; wrangler is logged in on the box). `RELAY_URL` and `RELAY_SECRET` are set in Vercel for
Production and Preview. Previews aren't in `ALLOWED_ORIGINS`, so their sockets are refused (403)
and they fall back to polling. They still publish to the same topics, which only makes production
screens refetch once. Redeploy after changing the Worker: `npx wrangler deploy` (clients reconnect).
To rotate the secret, `npx wrangler secret put RELAY_SECRET`, then update `RELAY_SECRET` in Vercel
and redeploy the app.

## Deploy (one time, done)

1. `npx wrangler login` (Brian's Cloudflare account). Check with `npx wrangler whoami`.
2. `npx wrangler secret put RELAY_SECRET` and paste a fresh random value (`openssl rand -hex 32`).
3. `npx wrangler deploy`. This prints the URL, e.g. `https://mixology-relay.<account>.workers.dev`.
4. Optional: a custom domain such as `relay.brianandkathi.com`. Workers custom domains need the zone on Cloudflare, and brianandkathi.com DNS is at Network Solutions, so this is skipped. The workers.dev URL is fine.
5. In Vercel (project `mixology`), set `RELAY_URL` (the URL from step 3 or 4) and `RELAY_SECRET` (the same value as step 2) for Production, and Preview if wanted. Then redeploy.
6. `ALLOWED_ORIGINS` in `wrangler.jsonc` lists the production domains. Add any preview origin that should connect.

To turn it off: remove `RELAY_URL` in Vercel and redeploy. Pages go back to polling.

## Cost

Workers Free covers it. One TV holds two sockets. Heartbeats are auto-answered, and a busy
evening is a few hundred publishes.
