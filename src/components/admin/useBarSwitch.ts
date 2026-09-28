"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/components/admin/api";
import { refreshTvCast } from "@/components/admin/ClearTv";
import { useRelay } from "@/lib/use-relay";

export type BarState = { open: boolean; openUntil: string | null };

/**
 * The admin menu's Open/Closed switch (DESIGN §3.1). Starts from the server's answer, stays current through
 * the bar:status relay topic, a re-read whenever the menu opens, and a re-read just after the 2:00 AM
 * self-close. toggle() is optimistic and rolls back if the save fails.
 */
export function useBarSwitch(initial: BarState, menuOpen: boolean) {
  const [state, setState] = useState<BarState>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);

  const reload = useCallback(async () => {
    if (busyRef.current) return;
    try {
      const res = await fetch("/api/bar/status", { cache: "no-store" });
      if (!res.ok) return; // keep what we show; the next check will try again
      const data = (await res.json()) as BarState;
      if (!busyRef.current) setState({ open: data.open, openUntil: data.openUntil });
    } catch {
      /* keep the last known state */
    }
  }, []);

  useRelay("bar:status", () => void reload());
  useEffect(() => { if (menuOpen) void reload(); }, [menuOpen, reload]);
  useEffect(() => {
    if (!state.openUntil) return;
    const wait = Date.parse(state.openUntil) - Date.now() + 1500;
    const id = window.setTimeout(() => void reload(), Math.max(0, Math.min(wait, 2 ** 31 - 1)));
    return () => window.clearTimeout(id);
  }, [state.openUntil, reload]);

  const toggle = useCallback(async () => {
    if (busyRef.current) return;
    const before = state;
    const open = !before.open;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setState({ open, openUntil: open ? before.openUntil : null });
    try {
      const data = await api<BarState & { castCleared?: boolean }>("/api/admin/bar", "PATCH", { open });
      setState({ open: data.open, openUntil: data.openUntil });
      if (data.castCleared) refreshTvCast();
    } catch (e) {
      setState(before);
      setError(e instanceof Error ? e.message : "Couldn't change the bar. Try again.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [state]);

  return { ...state, busy, error, toggle };
}
