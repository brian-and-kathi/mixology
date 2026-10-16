"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { refreshUnlessHeld } from "@/lib/tv-hold";
import { MENU_DEBOUNCE_MS, RELAY_FALLBACK_MS, useRelay } from "@/lib/use-relay";

/**
 * Keep a server-rendered page (TV board, phone menu) in step with the database without a reload.
 *
 * - Relay live: a `topic` notice refreshes the page, debounced (a burst of edits is one refresh).
 *   The slow fallback check (and a check when the tab comes back into view) asks POST /api/bar/sync
 *   for the database's menu version: a one-row read that also announces any direct-SQL edit nobody
 *   published yet (then the resulting notice does the refresh). Otherwise the page only re-renders
 *   when that version differs from the one it rendered (`version`), e.g. a notice that got lost. Without migration 028 (no version), the check just refreshes, as before.
 * - Relay off: refresh every `seconds` (no interval when `seconds` is unset).
 */
export function AutoRefresh({ seconds, topic, version }: { seconds?: number; topic?: string; version?: number | null }) {
  const router = useRouter();
  // Held while a Shindig game has the TV (lib/tv-hold.ts); a change during the game is applied once it's over.
  const refresh = () => refreshUnlessHeld(() => router.refresh());
  const live = useRelay(topic ?? null, refresh, MENU_DEBOUNCE_MS);
  const rendered = useRef(version);
  rendered.current = version;

  useEffect(() => {
    if (!live) {
      if (!seconds) return;
      const id = window.setInterval(() => refreshUnlessHeld(() => router.refresh()), seconds * 1000);
      return () => window.clearInterval(id);
    }
    const check = async () => {
      try {
        const res = await fetch("/api/bar/sync", { method: "POST", cache: "no-store" });
        const data = res.ok ? ((await res.json()) as { menu: number | null; published?: string[] }) : null;
        // This check just announced the change itself: the notice refreshes every screen (this one too).
        if (data?.published?.includes("bar:menu")) return;
        if (data?.menu == null || rendered.current == null || data.menu !== rendered.current) refreshUnlessHeld(() => router.refresh());
      } catch {
        refreshUnlessHeld(() => router.refresh());
      }
    };
    const id = window.setInterval(() => void check(), RELAY_FALLBACK_MS);
    const onVis = () => { if (!document.hidden) void check(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [router, seconds, live]);
  return null;
}
