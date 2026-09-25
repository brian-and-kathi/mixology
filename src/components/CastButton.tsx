"use client";

import { useCallback, useEffect, useState } from "react";

type CastState = { type: string; id: string; expires_at: string } | null;

const mss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * "Show on TV" on every cocktail and pour page (DESIGN §10). Casting replaces whatever is on
 * the TV with no confirmation; while this item is showing, anyone on this page can take it off.
 */
export function CastButton({ type, id }: { type: "recipe" | "pour"; id: string }) {
  const [cast, setCast] = useState<CastState>(null);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((data: { cast: CastState; now: string }) => {
    setOffset(Date.parse(data.now) - Date.now());
    setCast(data.cast ? { type: data.cast.type, id: data.cast.id, expires_at: data.cast.expires_at } : null);
  }, []);

  // Keep in step with the TV (someone else may cast or take it off); pause when hidden.
  useEffect(() => {
    let stop = false;
    const load = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/cast", { cache: "no-store" });
        if (res.ok && !stop) apply(await res.json());
      } catch {
        // Offline for a moment: keep the last known state.
      }
    };
    void load();
    const poll = window.setInterval(load, 5000);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    document.addEventListener("visibilitychange", load);
    return () => {
      stop = true;
      window.clearInterval(poll);
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", load);
    };
  }, [apply]);

  const remaining = cast ? Date.parse(cast.expires_at) - (now + offset) : 0;
  const onTv = !!cast && cast.type === type && cast.id === id && remaining > 0;

  async function send(method: "POST" | "DELETE") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/cast", { method, headers: { "content-type": "application/json" }, body: JSON.stringify({ type, id }) });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Couldn't reach the TV.");
      apply(data);
      navigator.vibrate?.(10);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't reach the TV.");
    } finally {
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
        {onTv ? "Take it off the TV" : "Show on TV"}
      </button>
      <p className="cast-status quiet" aria-live="polite">
        {error ? error : onTv ? `On the TV now · ${mss(remaining)} left` : "\u00a0"}
      </p>
    </div>
  );
}
