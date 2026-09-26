"use client";

import { useCallback, useSyncExternalStore } from "react";
import { api } from "@/components/admin/api";

type Showing = { name: string; expires: number } | null;

type CastState = {
  showing: Showing;
  offset: number;
  now: number;
  busy: boolean;
  error: string | null;
};

const INITIAL: CastState = { showing: null, offset: 0, now: 0, busy: false, error: null };

let state: CastState = INITIAL;
const listeners = new Set<() => void>();
let users = 0;
let poll = 0;
let tick = 0;
let rev = "";

function emit() {
  for (const listener of listeners) listener();
}

function setState(patch: Partial<CastState>) {
  state = { ...state, ...patch };
  emit();
}

function syncTick() {
  const need = state.showing != null;
  if (need && !tick) {
    tick = window.setInterval(() => setState({ now: Date.now() }), 1000);
  } else if (!need && tick) {
    window.clearInterval(tick);
    tick = 0;
  }
}

async function load() {
  if (document.hidden) return;
  try {
    const res = await fetch("/api/cast", { cache: "no-store", headers: rev ? { "if-none-match": rev } : {} });
    if (res.status === 304) {
      const headerNow = res.headers.get("x-now");
      if (headerNow) setState({ offset: Date.parse(headerNow) - Date.now() });
      return;
    }
    if (!res.ok) return;
    rev = res.headers.get("etag") ?? "";
    const data = (await res.json()) as { cast: { expires_at: string; payload: { name: string } } | null; now: string };
    setState({
      offset: Date.parse(data.now) - Date.now(),
      now: Date.now(),
      showing: data.cast ? { name: data.cast.payload.name, expires: Date.parse(data.cast.expires_at) } : null,
    });
    syncTick();
  } catch {
    // Keep the last known state.
  }
}

function start() {
  void load();
  poll = window.setInterval(() => void load(), 10_000);
  document.addEventListener("visibilitychange", load);
  syncTick();
}

function stop() {
  window.clearInterval(poll);
  window.clearInterval(tick);
  poll = 0;
  tick = 0;
  document.removeEventListener("visibilitychange", load);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  users += 1;
  if (users === 1) start();
  return () => {
    listeners.delete(listener);
    users -= 1;
    if (users === 0) stop();
  };
}

/** Shared by the stock status line and the header menu, so Clear TV updates both at once. */
export function useTvCast() {
  const snap = useSyncExternalStore(subscribe, () => state, () => INITIAL);
  const left = snap.showing ? Math.ceil((snap.showing.expires - (snap.now + snap.offset)) / 1000) : 0;
  const live = Boolean(snap.showing && left > 0);
  const clear = useCallback(async () => {
    setState({ busy: true, error: null });
    try {
      await api("/api/admin/cast", "DELETE");
      setState({ busy: false, showing: null });
      syncTick();
    } catch (e) {
      setState({ busy: false, error: e instanceof Error ? e.message : "Couldn't clear the TV." });
    }
  }, []);
  const clock = `${Math.floor(Math.max(left, 0) / 60)}:${String(Math.max(left, 0) % 60).padStart(2, "0")}`;
  return { live, busy: snap.busy, error: snap.error, clear, name: snap.showing?.name ?? "", clock };
}

/** Stock page: what the TV is showing. Clear TV itself lives in the header menu. */
export function ClearTv() {
  const tv = useTvCast();
  return (
    <p className="a-tvbar">
      {tv.error ? (
        tv.error
      ) : tv.live ? (
        <>
          On the TV: <strong>{tv.name}</strong> <span className="a-quiet">· {tv.clock} left</span>
        </>
      ) : (
        <span className="a-quiet">TV is showing the menu</span>
      )}
    </p>
  );
}
