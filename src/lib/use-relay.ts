"use client";

import { useEffect, useRef, useState } from "react";
import { subscribeRelay } from "@/lib/relay-client";

/**
 * Fallback poll while the relay socket is live: slow, just in case a notice is ever lost.
 * Kept just over Neon's 5-minute autosuspend so an idle evening lets the database sleep.
 */
export const RELAY_FALLBACK_MS = 6 * 60_000;
/** Notices closer together than this are coalesced into one refetch (leading + trailing). */
const COALESCE_MS = 500;

/**
 * Call `onChange` when the relay says `topic` changed (or on reconnect, if something changed
 * while disconnected). Returns whether the socket is live, so callers can slow their polling.
 * With the relay off (no RELAY_URL), it never calls back and always returns false.
 */
export function useRelay(topic: string | null, onChange: () => void): boolean {
  const [live, setLive] = useState(false);
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    if (!topic) return;
    let last = 0;
    let trailing = 0;
    const fire = () => {
      const wait = last + COALESCE_MS - Date.now();
      if (wait <= 0) {
        last = Date.now();
        cb.current();
      } else if (!trailing) {
        trailing = window.setTimeout(() => {
          trailing = 0;
          last = Date.now();
          cb.current();
        }, wait);
      }
    };
    const unsubscribe = subscribeRelay(topic, fire, setLive);
    return () => {
      window.clearTimeout(trailing);
      unsubscribe();
      setLive(false);
    };
  }, [topic]);

  return live;
}
