"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GlassIcon } from "@/components/GlassIcon";
import { KNOCK_PAD, knockGlass, type KnockId } from "@/lib/night-pad";

/** The door's challenge: three glasses, then it either opens or forgets the attempt. */
export function Door() {
  const router = useRouter();
  const [presses, setPresses] = useState<KnockId[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);
  const [note, setNote] = useState("");

  async function finish(next: KnockId[]) {
    setBusy(true);
    setNote("");
    try {
      const res = await fetch("/api/knock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ glasses: next }),
      });
      if (res.ok) {
        setOpen(true);
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.setTimeout(() => router.push("/lounge"), reduce ? 0 : 900);
        return;
      }
      setShake(true);
      setPresses([]);
      setNote(res.status === 503 ? "Unavailable" : "Try again");
      window.setTimeout(() => setShake(false), 450);
    } catch {
      setPresses([]);
      setNote("Try again");
    } finally {
      setBusy(false);
    }
  }

  function press(id: KnockId) {
    if (busy || open || presses.length >= 3) return;
    const next = [...presses, id];
    setPresses(next);
    setNote("");
    if (next.length === 3) void finish(next);
  }

  const keys = KNOCK_PAD.slice(0, 9);
  const last = KNOCK_PAD[9];

  return (
    <main className="cover door-scene">
      <div className={open ? "door open" : "door"}>
        <p className="door-knock">Knock</p>
        <div className={shake ? "door-slots shake" : "door-slots"} aria-hidden>
          {[0, 1, 2].map((index) => {
            const glass = knockGlass(presses[index] ?? "");
            return (
              <span key={index} className={glass ? "door-slot on" : "door-slot"}>
                {glass ? <GlassIcon glass={glass.name} label="" /> : null}
              </span>
            );
          })}
        </div>
        <div className="knock-pad" role="group" aria-label="Knock">
          {keys.map((glass) => (
            <button key={glass.id} type="button" className="knock-key" aria-label={glass.label} disabled={busy || open} onClick={() => press(glass.id)}>
              <GlassIcon glass={glass.name} label="" />
            </button>
          ))}
          <span className="knock-gap" />
          <button type="button" className="knock-key" aria-label={last.label} disabled={busy || open} onClick={() => press(last.id)}>
            <GlassIcon glass={last.name} label="" />
          </button>
          <button
            type="button"
            className="knock-key knock-undo"
            aria-label="Undo last"
            disabled={busy || open || presses.length === 0}
            onClick={() => setPresses((current) => current.slice(0, -1))}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M14 6 8 12l6 6" />
            </svg>
          </button>
        </div>
        <span className="door-knob" aria-hidden />
        <p className="door-note" role="status">{note}</p>
      </div>
    </main>
  );
}
