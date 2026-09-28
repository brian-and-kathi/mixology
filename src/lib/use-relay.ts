"use client";

import { useEffect, useRef, useState } from "react";
import { subscribeRelay } from "@/lib/relay-client";

/**
 * Fallback check while the relay socket is live: slow, just in case a notice is ever lost or a
 * direct-SQL edit was never announced. 15 minutes lets Neon (5-minute autosuspend) sleep two thirds
 * of an idle evening; the board's check is a one-row version read (POST /api/bar/sync).
 */
export const RELAY_FALLBACK_MS = 15 * 60_000;
/** Default: notices closer together than this are coalesced into one refetch (leading + trailing). */
const COALESCE_MS = 500;
/** Board refreshes wait for a quiet moment: a burst of edits (e.g. five stock toggles) is one refetch. */
export const MENU_DEBOUNCE_MS = 2000;
/** ...but a steady stream of edits still refreshes at least this often. */
const MENU_MAX_WAIT_MS = 6000;

/**
 * Call `onChange` when the relay says `topic` changed (or on reconnect, if something changed
 * while disconnected). Returns whether the socket is live, so callers can slow their polling.
 * With the relay off (no RELAY_URL), it never calls back and always returns false.
 * `debounceMs`: instead of the default fast coalescing (casts should feel instant), wait until
 * notices have been quiet this long (trailing only, capped at 6 s from the first one).
 */
export function useRelay(topic: string | null, onChange: () => void, debounceMs?: number): boolean {
  const [live, setLive] = useState(false);
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    if (!topic) return;
    let last = 0;
    let trailing = 0;
    let first = 0;
    const settle = () => {
      trailing = 0;
      first = 0;
      last = Date.now();
      cb.current();
    };
    const debounce = () => {
      const now = Date.now();
      first ||= now;
      window.clearTimeout(trailing);
      trailing = window.setTimeout(settle, Math.max(0, Math.min(debounceMs!, first + MENU_MAX_WAIT_MS - now)));
    };
    const coalesce = () => {
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
    const fire = debounceMs ? debounce : coalesce;
    const unsubscribe = subscribeRelay(topic, fire, setLive);
    return () => {
      window.clearTimeout(trailing);
      unsubscribe();
      setLive(false);
    };
  }, [topic, debounceMs]);

  return live;
}
