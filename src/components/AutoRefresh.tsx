"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { RELAY_FALLBACK_MS, useRelay } from "@/lib/use-relay";

/**
 * Re-fetch server data on an interval so the TV follows inventory changes without a reload.
 * With a relay `topic` and the relay live, a notice triggers the refresh instead, and the
 * interval drops to a slow fallback plus a refresh whenever the tab comes back into view.
 */
export function AutoRefresh({ seconds, topic }: { seconds: number; topic?: string }) {
  const router = useRouter();
  const live = useRelay(topic ?? null, () => router.refresh());
  useEffect(() => {
    const id = window.setInterval(() => router.refresh(), live ? RELAY_FALLBACK_MS : seconds * 1000);
    if (!live) return () => window.clearInterval(id);
    const onVis = () => { if (!document.hidden) router.refresh(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [router, seconds, live]);
  return null;
}
