"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { RELAY_FALLBACK_MS, useRelay } from "@/lib/use-relay";

// Keeps an open guest screen (phone pages, the TV, the knock page, the lounge) in step with the bar's
// Open/Closed status without a reload (DESIGN §3.1). The page itself is rendered by the server for the
// status it saw; this only notices a change and asks for a fresh render (router.refresh), so the server
// stays the judge of what a guest may see.
//
// - Relay live: a bar:status notice checks at once; otherwise a slow fallback check (and one when the
//   tab comes back into view). Relay off or down: poll every POLL_MS while visible.
// - openUntil: one check just after the 2:00 AM self-close, so open screens close on time with no publish.
// - Grace: a failed read keeps the last known state. Only after GRACE_MS without one good read does an open
//   screen re-render, and then the server decides (it fails closed if it can't read the status either).

const POLL_MS = 10_000;
export const CLIENT_GRACE_MS = 45_000;

export type BarView = { open: boolean; openUntil: string | null; now: string };

export function BarWatch({ open, openUntil, now }: BarView) {
  const router = useRouter();
  const rendered = useRef(open);
  rendered.current = open;
  const offset = useRef(Date.parse(now) - Date.now()); // server clock minus ours
  const lastOk = useRef(Date.now());
  const [until, setUntil] = useState(openUntil);
  useEffect(() => setUntil(openUntil), [openUntil]);

  const check = useCallback(async () => {
    try {
      const res = await fetch("/api/bar/status", { cache: "no-store" });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as { open: boolean; openUntil: string | null; now: string };
      lastOk.current = Date.now();
      offset.current = Date.parse(data.now) - Date.now();
      setUntil(data.openUntil);
      if (data.open !== rendered.current) router.refresh();
    } catch {
      if (rendered.current && Date.now() - lastOk.current > CLIENT_GRACE_MS) router.refresh();
    }
  }, [router]);

  const live = useRelay("bar:status", () => void check());

  useEffect(() => {
    const tick = () => { if (!document.hidden) void check(); };
    const id = window.setInterval(tick, live ? RELAY_FALLBACK_MS : POLL_MS);
    const onVis = () => { if (!document.hidden) void check(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [check, live]);

  // The self-close: check shortly after openUntil (server clock), spread over a second or so.
  useEffect(() => {
    if (!until) return;
    const wait = Date.parse(until) - (Date.now() + offset.current) + 300 + Math.random() * 1200;
    const id = window.setTimeout(() => void check(), Math.max(0, Math.min(wait, 2 ** 31 - 1)));
    return () => window.clearTimeout(id);
  }, [until, check]);

  return null;
}
