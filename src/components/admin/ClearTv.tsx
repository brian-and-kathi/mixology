"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/admin/api";

type Showing = { name: string; expires: number } | null;

/** Stock header: what the TV is showing, with a one-tap "Clear TV" (DESIGN §10.1). */
export function ClearTv() {
  const [showing, setShowing] = useState<Showing>(null);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/cast", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { cast: { expires_at: string; payload: { name: string } } | null; now: string };
      setOffset(Date.parse(data.now) - Date.now());
      setShowing(data.cast ? { name: data.cast.payload.name, expires: Date.parse(data.cast.expires_at) } : null);
    } catch {
      // Keep the last known state.
    }
  }, []);

  useEffect(() => {
    void load();
    const poll = window.setInterval(load, 5000);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, [load]);

  const left = showing ? Math.ceil((showing.expires - (now + offset)) / 1000) : 0;
  const live = showing && left > 0;

  async function clear() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/admin/cast", "DELETE");
      setShowing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't clear the TV.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="a-tvbar">
      <p className="a-tvbar-text">
        {error ? error : live ? <>On the TV: <strong>{showing.name}</strong> <span className="a-quiet">· {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")} left</span></> : <span className="a-quiet">TV is showing the menu</span>}
      </p>
      <button type="button" className="a-btn a-tvbar-btn" onClick={clear} disabled={busy || !live}>Clear TV</button>
    </div>
  );
}
