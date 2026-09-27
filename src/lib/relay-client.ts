// Realtime relay, browser side. One shared WebSocket per topic per tab, however many
// components listen. The socket only says "topic changed"; listeners refetch through the
// app's existing API. Reconnects with backoff; a heartbeat detects dead sockets.
//
// The relay is on only when the root layout rendered <meta name="relay-url"> (RELAY_URL set
// on the server). Without it nothing here opens a connection.

export type RelayNotice = { type: "hello" | "notice"; topic: string; version: number; kind: string };
type Listener = { onChange: (n: RelayNotice) => void; onLive: (live: boolean) => void };

const PING_MS = 30_000;
const PONG_WAIT_MS = 10_000;
const BACKOFF_MIN_MS = 1_000;
const BACKOFF_MAX_MS = 15_000;

export function relayUrl(): string | null {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLMetaElement>('meta[name="relay-url"]')?.content || null;
}

class Channel {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private lastVersion: number | null = null;
  private attempt = 0;
  private retry = 0;
  private ping = 0;
  private pongDue = 0;
  live = false;

  constructor(private url: string, private topic: string, private onEmpty: () => void) {}

  add(l: Listener) {
    this.listeners.add(l);
    if (this.listeners.size === 1) this.start();
    else l.onLive(this.live);
  }

  remove(l: Listener) {
    this.listeners.delete(l);
    if (this.listeners.size === 0) {
      this.stop();
      this.onEmpty();
    }
  }

  private start() {
    document.addEventListener("visibilitychange", this.wake);
    window.addEventListener("online", this.wake);
    this.connect();
  }

  private stop() {
    document.removeEventListener("visibilitychange", this.wake);
    window.removeEventListener("online", this.wake);
    window.clearTimeout(this.retry);
    this.retry = 0;
    this.drop();
  }

  /** Back in view or back online: reconnect now instead of waiting out the backoff. */
  private wake = () => {
    if (document.hidden || this.ws) return;
    window.clearTimeout(this.retry);
    this.retry = 0;
    this.connect();
  };

  private connect() {
    let ws: WebSocket;
    try {
      const u = new URL(this.url);
      u.searchParams.set("topic", this.topic);
      ws = new WebSocket(u.toString());
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.onmessage = (e) => {
      window.clearTimeout(this.pongDue);
      if (e.data === "pong") return;
      let msg: RelayNotice;
      try {
        msg = JSON.parse(String(e.data)) as RelayNotice;
      } catch {
        return;
      }
      if (msg.topic !== this.topic || typeof msg.version !== "number") return;
      if (msg.type === "hello") {
        this.attempt = 0;
        this.setLive(true);
      }
      // Catch-up: a hello whose version differs from the last one seen means we missed
      // something while away (or this is the first connect). A notice is always news.
      const changed = msg.type === "notice" || msg.version !== this.lastVersion;
      this.lastVersion = msg.version;
      if (changed) for (const l of this.listeners) l.onChange(msg);
    };
    ws.onopen = () => {
      this.ping = window.setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN) return;
        ws.send("ping");
        window.clearTimeout(this.pongDue);
        this.pongDue = window.setTimeout(() => ws.close(), PONG_WAIT_MS); // dead socket: onclose reconnects
      }, PING_MS);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.drop();
      this.scheduleReconnect();
    };
    ws.onerror = () => {
      /* onclose follows */
    };
  }

  private drop() {
    window.clearInterval(this.ping);
    window.clearTimeout(this.pongDue);
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onclose = ws.onmessage = ws.onopen = ws.onerror = null;
      try {
        ws.close();
      } catch {
        /* already closed */
      }
    }
    this.setLive(false);
  }

  private scheduleReconnect() {
    if (this.listeners.size === 0 || this.retry) return;
    const cap = Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** this.attempt);
    this.attempt += 1;
    const delay = cap / 2 + Math.random() * (cap / 2); // jitter so TVs and phones don't stampede
    this.retry = window.setTimeout(() => {
      this.retry = 0;
      this.connect();
    }, delay);
  }

  private setLive(live: boolean) {
    if (this.live === live) return;
    this.live = live;
    for (const l of this.listeners) l.onLive(live);
  }
}

const channels = new Map<string, Channel>();

/** Listen for "changed" notices on a topic. Returns an unsubscribe; a no-op when the relay is off. */
export function subscribeRelay(topic: string, onChange: (n: RelayNotice) => void, onLive: (live: boolean) => void = () => {}): () => void {
  const url = relayUrl();
  if (!url) return () => {};
  let ch = channels.get(topic);
  if (!ch) {
    ch = new Channel(url, topic, () => channels.delete(topic));
    channels.set(topic, ch);
  }
  const listener: Listener = { onChange, onLive };
  ch.add(listener);
  const channel = ch;
  return () => channel.remove(listener);
}
