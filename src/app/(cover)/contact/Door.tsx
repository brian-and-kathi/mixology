"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GlassIcon } from "@/components/GlassIcon";
import { KNOCK_PAD, knockGlass, type KnockId } from "@/lib/night-pad";

function KnockKey({ glass, disabled, onPress }: { glass: (typeof KNOCK_PAD)[number]; disabled: boolean; onPress: (id: KnockId) => void }) {
  return (
    <button type="button" className="knock-key" aria-label={glass.label} disabled={disabled} onClick={() => onPress(glass.id)}>
      <GlassIcon glass={glass.name} label="" />
      <span className="knock-tip" role="tooltip">{glass.label}</span>
    </button>
  );
}

/** The door's challenge: three glasses, then it either opens or forgets the attempt. */
export function Door() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const playing = useRef(false);
  const sent = useRef(false);
  const [presses, setPresses] = useState<KnockId[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const hold = () => {
      if (playing.current) return;
      video.pause();
      if (video.currentTime !== 0) video.currentTime = 0;
    };
    video.addEventListener("loadeddata", hold);
    return () => video.removeEventListener("loadeddata", hold);
  }, []);

  async function finish(next: KnockId[]) {
    setBusy(true);
    setNote("");
    try {
      const res = await fetch("/api/knock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ glasses: next }),
      });
      if (!res.ok) sent.current = false;
      if (res.ok) {
        setOpen(true);
        const video = videoRef.current;
        const go = () => router.push("/lounge");
        if (!video) {
          go();
          return;
        }
        playing.current = true;
        const limit = Number.isFinite(video.duration) ? video.duration * 1000 + 800 : 12_000;
        const timer = window.setTimeout(go, limit);
        video.addEventListener("ended", () => { window.clearTimeout(timer); go(); }, { once: true });
        try {
          await video.play();
        } catch {
          window.clearTimeout(timer);
          go();
        }
        return;
      }
      setShake(true);
      setPresses([]);
      setNote(res.status === 503 ? "Unavailable" : "Try again");
      window.setTimeout(() => setShake(false), 450);
    } catch {
      sent.current = false;
      setPresses([]);
      setNote("Try again");
    } finally {
      setBusy(false);
    }
  }

  function press(id: KnockId) {
    if (busy || open) return;
    setNote("");
    setPresses((current) => (current.length >= 3 ? current : [...current, id]));
  }

  useEffect(() => {
    if (presses.length === 3 && !sent.current) {
      sent.current = true;
      void finish(presses);
    }
  }, [presses]);

  const keys = KNOCK_PAD.slice(0, 9);
  const last = KNOCK_PAD[9];

  return (
    <main className="cover door-scene">
      <video
        ref={videoRef}
        className="door-video"
        src="/heavy_door_opening.mp4"
        muted
        playsInline
        preload="auto"
        aria-hidden
      />
      <div className="door">
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
            <KnockKey key={glass.id} glass={glass} disabled={busy || open} onPress={press} />
          ))}
          <span className="knock-gap" />
          <KnockKey glass={last} disabled={busy || open} onPress={press} />
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
        <p className="door-note" role="status">{note}</p>
      </div>
    </main>
  );
}
