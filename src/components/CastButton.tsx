"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { onBarStatus } from "@/lib/bar-events";
import type { CastType } from "@/lib/cast";
import { RELAY_FALLBACK_MS, useRelay } from "@/lib/use-relay";

type CastState = { type: string; id: string; started_at: string; expires_at: string; servings: number } | null;
/** GET /api/cast returns the row plus its built payload. Servings live on a recipe payload. */
type CastWire = { type: string; id: string; started_at: string; expires_at: string; payload?: { type?: string; servings?: number } } | null;

const POLL_MS = 10_000;
const HIDE_MS = 5_000;
const LEAVE_MS = 400;
const OWN = "cast-owner";
/** Cancelled on the next mount, so a dev remount does not take the cast off the TV. */
let leaveTimer = 0;

type Own = { type: string; id: string; started_at: string };

const ownKey = (c: Own) => `${c.type}:${c.id}:${c.started_at}`;

function readOwn(): Own | null {
  try {
    const raw = sessionStorage.getItem(OWN);
    if (!raw) return null;
    const v = JSON.parse(raw) as Own;
    return v?.type && v.id && v.started_at ? v : null;
  } catch { return null; }
}

function writeOwn(value: Own | null) {
  try {
    if (value) sessionStorage.setItem(OWN, JSON.stringify(value));
    else sessionStorage.removeItem(OWN);
  } catch { /* private mode: this phone just won't auto-clear */ }
}

/** Take our cast off the TV. No-op unless this tab started it. started_at keeps a newer cast of the same drink up. */
function endOwned(type: string, id: string, cast: CastState) {
  const saved = readOwn();
  if (!saved || saved.type !== type || saved.id !== id) return;
  if (cast && ownKey(cast) !== ownKey(saved)) return;
  writeOwn(null);
  void fetch("/api/cast", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type, id, started_at: saved.started_at }),
    keepalive: true,
  }).catch(() => {});
}

/** Shown in the status line when this page's cast came off the TV before its time ran out. */
export const ENDED_BAR_CLOSED = "Off the TV \u00b7 the bar closed";
export const ENDED_TAKEN_OFF = "Taken off the TV";
/** A cast that disappears with less than this left just ran out; no message. */
const EARLY_MS = 1500;

/** Why a cast ended early: the bar closed (auto or manual), or someone took it off / replaced it. */
async function endedReason(): Promise<string> {
  try {
    const res = await fetch("/api/bar/status", { cache: "no-store" });
    if (res.ok && (await res.json() as { open: boolean }).open === false) return ENDED_BAR_CLOSED;
  } catch { /* fall through */ }
  return ENDED_TAKEN_OFF;
}

const mss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * "Show on TV" on every cocktail, pour and Cellar wine page (DESIGN §10). Casting replaces whatever is on
 * the TV with no confirmation; while this item is showing, anyone on this page can take it off.
 */
export function CastButton({ type, id, servings, onServings }: { type: CastType; id: string; servings?: number; onServings?: (n: number) => void }) {
  const [cast, setCast] = useState<CastState>(null);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ended, setEnded] = useState<string | null>(null);

  const castRef = useRef(cast);
  castRef.current = cast;
  const servingsRef = useRef(servings);
  servingsRef.current = servings;
  /** Servings last confirmed by the server for this cast, so a poll doesn't fight the slider. */
  const remoteServings = useRef<number | null>(null);
  const onServingsRef = useRef(onServings);
  onServingsRef.current = onServings;
  /** Set while this tab's own "Take it off the TV" is in flight, so that removal shows no message. */
  const selfStop = useRef(false);

  const apply = useCallback((data: { cast: CastWire; now: string }) => {
    setOffset(Date.parse(data.now) - Date.now());
    const fromPayload = data.cast?.payload?.type === "recipe" ? data.cast.payload.servings : undefined;
    const next = data.cast ? { type: data.cast.type, id: data.cast.id, started_at: data.cast.started_at, expires_at: data.cast.expires_at, servings: fromPayload ?? 1 } : null;
    // This item was on the TV with time left and the server no longer shows it: say so, and why.
    const prev = castRef.current;
    const wasOurs = !!prev && prev.type === type && prev.id === id && Date.parse(prev.expires_at) - Date.parse(data.now) > EARLY_MS;
    const stillOurs = !!next && !!prev && ownKey(next) === ownKey(prev);
    if (next && next.type === type && next.id === id) setEnded(null);
    else if (wasOurs && !stillOurs && !selfStop.current) void endedReason().then(setEnded);
    castRef.current = next;
    setCast(next);
    if (next && next.type === type && next.id === id) {
      remoteServings.current = next.servings;
      onServingsRef.current?.(next.servings);
    }
    // Drop ownership once the server no longer has the cast this tab started.
    const saved = readOwn();
    if (saved && saved.type === type && saved.id === id && (!next || ownKey(next) !== ownKey(saved))) writeOwn(null);
  }, [type, id]);

  // Keep in step with the TV (someone else may cast or take it off); pause when hidden.
  // With the relay live, a "bar:cast" notice triggers the check and the poll slows to a fallback.
  const loadRef = useRef<() => Promise<void>>(async () => {});
  const relayLive = useRelay("bar:cast", () => void loadRef.current());
  // The bar opened or closed (BarWatch). A close ends a cast from before it, and the 2:00 AM self-close
  // publishes nothing, so ask now. (If casting is ever turned off while Closed, this is where it'd hook in.)
  useEffect(() => onBarStatus(() => void loadRef.current()), []);
  useEffect(() => {
    let stop = false;
    let rev = "";
    const load = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/cast", { cache: "no-store", headers: rev ? { "if-none-match": rev } : {} });
        if (stop) return;
        if (res.status === 304) {
          const now = res.headers.get("x-now");
          if (now) setOffset(Date.parse(now) - Date.now());
          return;
        }
        if (res.ok) {
          rev = res.headers.get("etag") ?? "";
          apply(await res.json());
        }
      } catch {
        // Offline for a moment: keep the last known state.
      }
    };
    loadRef.current = load;
    void load();
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    document.addEventListener("visibilitychange", load);
    return () => {
      stop = true;
      loadRef.current = async () => {};
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", load);
    };
  }, [apply]);
  useEffect(() => {
    const poll = window.setInterval(() => void loadRef.current(), relayLive ? RELAY_FALLBACK_MS : POLL_MS);
    return () => window.clearInterval(poll);
  }, [relayLive]);

  // This tab started the cast: take it off when they leave the page, or after the page has been
  // hidden (switched apps, screen off) for a few seconds. Back within that window leaves it up.
  useEffect(() => {
    window.clearTimeout(leaveTimer);
    let hideTimer = 0;
    let hiddenAt = 0;
    const end = () => endOwned(type, id, castRef.current);
    const onVis = () => {
      window.clearTimeout(hideTimer);
      if (document.hidden) {
        hiddenAt = Date.now();
        hideTimer = window.setTimeout(end, HIDE_MS);
      } else if (hiddenAt && Date.now() - hiddenAt >= HIDE_MS) {
        hiddenAt = 0;
        end();
      } else {
        hiddenAt = 0;
      }
    };
    const onPageHide = (e: PageTransitionEvent) => {
      if (e.persisted) return;
      window.clearTimeout(hideTimer);
      end();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onPageHide);
      window.clearTimeout(hideTimer);
      leaveTimer = window.setTimeout(end, LEAVE_MS);
    };
  }, [type, id]);

  const remaining = cast ? Date.parse(cast.expires_at) - (now + offset) : 0;
  const onTv = !!cast && cast.type === type && cast.id === id && remaining > 0;

  // This recipe is already on the TV and the slider moved: tell the TV without restarting the 5 minutes.
  useEffect(() => {
    if (type !== "recipe" || servings == null || !onTv) return;
    if (remoteServings.current == null || servings === remoteServings.current) return;
    const n = servings;
    const t = window.setTimeout(() => {
      remoteServings.current = n;
      void fetch("/api/cast", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type, id, servings: n, keep: true }),
      }).then(async (res) => {
        if (res.ok) apply(await res.json());
      }).catch(() => {});
    }, 150);
    return () => window.clearTimeout(t);
  }, [servings, onTv, type, id, apply]);

  async function send(method: "POST" | "DELETE") {
    setBusy(true);
    setError(null);
    setEnded(null);
    selfStop.current = method === "DELETE";
    try {
      const scale = servingsRef.current;
      const res = await fetch("/api/cast", {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type, id, ...(method === "POST" && type === "recipe" && scale != null ? { servings: scale } : {}) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Couldn't reach the TV.");
      apply(data);
      if (method === "POST" && data?.cast?.type === type && data.cast.id === id && data.cast.started_at) writeOwn({ type, id, started_at: data.cast.started_at });
      if (method === "DELETE") writeOwn(null);
      navigator.vibrate?.(10);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't reach the TV.");
    } finally {
      selfStop.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="cast">
      <button type="button" className={onTv ? "cast-btn on" : "cast-btn"} disabled={busy} onClick={() => send(onTv ? "DELETE" : "POST")}>
        <svg viewBox="0 0 24 24" aria-hidden className="cast-icon">
          <rect x="2.5" y="4" width="19" height="13" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M8 20.5h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        {/* The recipe page's pinned strip (RecipePin) swaps in the short label; elsewhere only the long one shows. */}
        <span className="cast-label">{onTv ? "Take it off the TV" : "Show on TV"}</span>
        <span className="cast-label-short">{onTv ? "Take off" : "Show on TV"}</span>
      </button>
      <p className="cast-status quiet" aria-live="polite" data-idle={error || onTv || ended ? undefined : ""}>
        {error ? error : onTv ? `On the TV now · ${mss(remaining)} left` : ended ?? "\u00a0"}
      </p>
    </div>
  );
}
