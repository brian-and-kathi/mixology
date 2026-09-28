"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/components/admin/api";
import { refreshTvCast } from "@/components/admin/ClearTv";
import { announceBarStatus } from "@/lib/bar-events";
import { useRelay } from "@/lib/use-relay";

export type BarState = {
  open: boolean;
  openUntil: string | null;
  /** When it opened (while open) and when it closed (while closed); null when unknown. */
  openedAt?: string | null;
  closedSince?: string | null;
};

const pick = (d: BarState): BarState => ({ open: d.open, openUntil: d.openUntil, openedAt: d.openedAt ?? null, closedSince: d.closedSince ?? null });

/**
 * The admin Open/Closed switch (DESIGN §3.1), shared by the ☰ menu and the Bar tab through
 * BarSwitchProvider, so there is one state per page. Starts from the server's answer, stays current through
 * the bar:status relay topic, reload() (the menu calls it when it opens, the Bar tab when it mounts), and a
 * re-read just after the 2:00 AM self-close. toggle() is optimistic and rolls back if the save fails.
 */
export function useBarSwitch(initial: BarState) {
  const [state, setState] = useState<BarState>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const openRef = useRef(initial.open);
  // Tell the page when the status changes (the 2:00 AM self-close publishes nothing): ClearTv re-reads the cast.
  const show = useCallback((next: BarState) => {
    setState(next);
    if (next.open !== openRef.current) {
      openRef.current = next.open;
      announceBarStatus(next.open);
    }
  }, []);

  const reload = useCallback(async () => {
    if (busyRef.current) return;
    try {
      const res = await fetch("/api/admin/bar", { cache: "no-store" });
      if (!res.ok) return; // keep what we show; the next check will try again
      const data = (await res.json()) as BarState;
      if (!busyRef.current) show(pick(data));
    } catch {
      /* keep the last known state */
    }
  }, [show]);

  useRelay("bar:status", () => void reload());
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
    setState({ open, openUntil: open ? before.openUntil : null, openedAt: open ? null : before.openedAt, closedSince: open ? null : new Date().toISOString() });
    try {
      const data = await api<BarState & { castCleared?: boolean }>("/api/admin/bar", "PATCH", { open });
      show(pick(data));
      if (data.castCleared) refreshTvCast();
    } catch (e) {
      setState(before);
      setError(e instanceof Error ? e.message : "Couldn't change the bar. Try again.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [state]);

  return { ...state, busy, error, toggle, reload };
}
