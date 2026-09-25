"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const LENGTH = 4;
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"] as const;

const unit = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** "5 minutes", "1 minute", "1 hour", "1 hour 15 minutes", "2 hours" (rounded up to the minute). */
export function waitText(seconds: number): string {
  const m = Math.max(1, Math.ceil(seconds / 60));
  if (m < 60) return unit(m, "minute");
  const h = Math.floor(m / 60), rest = m % 60;
  return rest ? `${unit(h, "hour")} ${unit(rest, "minute")}` : unit(h, "hour");
}

/** Live countdown while locked: "4:12" under an hour; long waits read better in words ("1 hour"). */
export function countdown(seconds: number): string {
  if (seconds > 3540) return waitText(seconds);
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const lockText = (seconds: number) => `Too many tries. Try again in ${countdown(seconds)}.`;
// Screen readers hear the lockout once, in words, not a new alert every second.
const lockSpoken = (seconds: number) => `Too many tries. Try again in ${waitText(seconds)}.`;

/**
 * Admin sign-in keypad. Four dots (never the digits), a 3x4 keypad of real buttons, auto-submit on the
 * 4th digit. No text input, so a phone's system keyboard never opens; a physical keyboard still works
 * (digits, Backspace, Enter). Wrong PIN: dots shake, clear, "Wrong PIN". Lockout (server-side, IP and
 * device): keys disabled with a countdown that re-enables them when it ends.
 */
export function PinPad({ next, initialLockedSeconds, signedOut }: { next: string; initialLockedSeconds: number; signedOut: boolean }) {
  const [digits, setDigits] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [spoken, setSpoken] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const digitsRef = useRef("");
  digitsRef.current = digits;

  // Lockout known at page load: start the countdown from the server's remaining seconds.
  useEffect(() => {
    if (initialLockedSeconds > 0) {
      setLockedUntil(Date.now() + initialLockedSeconds * 1000);
      setSpoken(lockSpoken(initialLockedSeconds));
    }
  }, [initialLockedSeconds]);

  const remaining = lockedUntil ? Math.max(0, Math.ceil((lockedUntil - now) / 1000)) : 0;
  const locked = remaining > 0;
  const disabled = checking || locked;

  useEffect(() => {
    if (!lockedUntil) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= lockedUntil) {
        setLockedUntil(null);
        setError(null);
        setSpoken("You can try again now.");
      }
    }, 1000);
    return () => clearInterval(t);
  }, [lockedUntil]);

  const submit = useCallback(async (pin: string) => {
    setChecking(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pin, next }),
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; next?: string; error?: string; retryAfter?: number };
      if (res.ok && data.ok) {
        window.location.assign(data.next || next);
        return; // keep the keys disabled while the next page loads
      }
      setDigits("");
      if (data.error === "locked") {
        setNow(Date.now());
        setLockedUntil(Date.now() + (data.retryAfter ?? 300) * 1000);
        setSpoken(lockSpoken(data.retryAfter ?? 300));
      } else if (data.error === "wrong") {
        setError("Wrong PIN");
        setShake((s) => s + 1);
        if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(180);
      } else {
        setError(data.error === "config" ? "Admin isn't set up yet." : "Couldn't check the PIN. Try again.");
      }
    } catch {
      setDigits("");
      setError("Couldn't reach the server. Try again.");
    }
    setChecking(false);
  }, [next]);

  const press = useCallback((key: string) => {
    if (disabled) return;
    if (key === "del") {
      setDigits((d) => d.slice(0, -1));
      return;
    }
    if (!/^\d$/.test(key)) return;
    const d = digitsRef.current;
    if (d.length >= LENGTH) return;
    setSpoken(null);
    const nextDigits = d + key;
    setDigits(nextDigits);
    if (error) setError(null);
    if (nextDigits.length === LENGTH) void submit(nextDigits);
  }, [disabled, error, submit]);

  // Physical keyboard: digits (top row or numpad), Backspace, Enter (retries a full entry).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^\d$/.test(e.key)) {
        e.preventDefault();
        press(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        press("del");
      } else if (e.key === "Enter" && digitsRef.current.length === LENGTH && !disabled) {
        e.preventDefault();
        void submit(digitsRef.current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press, submit, disabled]);

  const message = locked ? lockText(remaining) : error;

  return (
    <section className="a-card a-pin" aria-labelledby="pin-title">
      <h1 id="pin-title" className="a-h1 a-pin-title">Enter PIN</h1>
      <div key={`dots-${shake}`} className={shake ? "a-pin-dots shake" : "a-pin-dots"} aria-hidden>
        {Array.from({ length: LENGTH }, (_, i) => (
          <span key={i} className={i < digits.length ? "a-pin-dot on" : "a-pin-dot"} />
        ))}
      </div>
      <p className="a-sr" aria-live="polite" aria-atomic="true">{checking ? "Checking" : `${digits.length} of ${LENGTH} digits entered`}</p>
      {/* Visible message; while locked it ticks every second, so it's hidden from screen readers and the
          lockout is announced once (in words) by the alert below instead. */}
      <p className={locked ? "a-pin-msg locked" : "a-pin-msg"} aria-hidden={locked || undefined}>
        {message ?? (signedOut ? <span className="a-quiet">Signed out.</span> : "\u00a0")}
      </p>
      <p key={`alert-${shake}`} className="a-sr" role="alert">{locked ? spoken : error ?? spoken ?? ""}</p>
      <div className="a-pin-keys" role="group" aria-label="PIN keypad">
        {KEYS.map((k, i) =>
          k === "" ? (
            <span key={i} className="a-pin-gap" aria-hidden />
          ) : k === "del" ? (
            <button key={i} type="button" className="a-pin-key a-pin-del" aria-label="Delete" disabled={locked || checking || digits.length === 0} onClick={() => press("del")}>
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M9 5h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-6-7z" />
                <path d="M12.5 9.5l5 5M17.5 9.5l-5 5" />
              </svg>
            </button>
          ) : (
            <button key={i} type="button" className="a-pin-key" disabled={disabled} onClick={() => press(k)}>{k}</button>
          ),
        )}
      </div>
      <p className="a-quiet a-small a-pin-note">This device stays signed in for about six months.</p>
    </section>
  );
}
