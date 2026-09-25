"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { GlassIcon } from "@/components/GlassIcon";
import type { Cast, CastPayload } from "@/lib/cast";

// TV side of "Show on TV" (DESIGN §10). Polls /api/cast every 2 s; while something is cast,
// a bottom band slides up and the menu above shrinks to fit, with the cast item highlighted.
const POLL_MS = 2000;
const SLIDE_MS = 400;

type Highlight = { type: string; id: string } | null;
const CastContext = createContext<Highlight>(null);
/** The item currently on the TV band, for highlighting it in its list. */
export const useCastHighlight = () => useContext(CastContext);

const mss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function TvCastLayer({ children }: { children: ReactNode }) {
  const [cast, setCast] = useState<Cast | null>(null);
  const [shown, setShown] = useState<Cast | null>(null); // stays set while the band slides out
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const offset = useRef(0); // server clock minus ours, so the countdown matches expires_at

  // Poll the single cast record.
  useEffect(() => {
    let stop = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/cast", { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as { cast: Cast | null; now: string };
          offset.current = Date.parse(data.now) - Date.now();
          if (!stop) setCast((prev) => (prev && data.cast && prev.id === data.cast.id && prev.started_at === data.cast.started_at && JSON.stringify(prev.payload) === JSON.stringify(data.cast.payload) ? prev : data.cast));
        }
      } catch {
        // Network blip: keep showing what we have; the clock still ends it on time.
      }
    };
    void poll();
    const id = window.setInterval(poll, POLL_MS);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, []);

  // One clock drives both the progress bar and the m:ss label, so they always agree.
  useEffect(() => {
    if (!cast) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [cast]);

  const serverNow = now + offset.current;
  const live = cast && Date.parse(cast.expires_at) > serverNow ? cast : null;

  // Slide in / out. A new cast while one is showing just swaps the content.
  useEffect(() => {
    if (live) {
      setShown(live);
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setOpen(true)));
      return () => cancelAnimationFrame(raf);
    }
    setOpen(false);
    const t = window.setTimeout(() => setShown(null), SLIDE_MS);
    return () => window.clearTimeout(t);
  }, [live]);

  const highlight = open && shown ? { type: shown.type, id: shown.id } : null;
  const total = shown ? Date.parse(shown.expires_at) - Date.parse(shown.started_at) : 1;
  const remaining = shown ? Math.max(0, Date.parse(shown.expires_at) - serverNow) : 0;

  return (
    <CastContext.Provider value={highlight}>
      <div className={`tv${open ? " tv-casting" : ""}`}>
        {children}
        {shown ? (
          <section className={`tv-band${open ? " open" : ""}`} aria-live="polite" aria-label={`On the TV: ${shown.payload.name}`}>
            <div className="tv-band-progress" aria-hidden>
              <div className="tv-band-fill" style={{ width: `${Math.min(100, (remaining / total) * 100)}%` }} />
            </div>
            <span className="tv-band-clock">{mss(remaining)}</span>
            <BandBody payload={shown.payload} />
          </section>
        ) : null}
      </div>
    </CastContext.Provider>
  );
}

/** The band's columns (30/35/35). Empty columns are left out; long content is scaled down to fit. */
function BandBody({ payload }: { payload: CastPayload }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => setScale(1), [payload]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || scale <= 0.6) return;
    const over = [...el.children].some((c) => (c as HTMLElement).scrollHeight > (c as HTMLElement).clientHeight + 1);
    if (over) setScale((s) => Math.round((s - 0.06) * 100) / 100);
  });
  useEffect(() => {
    void document.fonts?.ready.then(() => setScale(1));
  }, []);

  const cols: { key: string; weight: number; body: ReactNode }[] = [];
  if (payload.type === "recipe") {
    cols.push({
      key: "hero", weight: 30, body: (
        <>
          {payload.glass ? <GlassIcon glass={payload.glass} className="tv-band-glass" /> : null}
          <h3 className="tv-band-name">{payload.name}</h3>
          {payload.serve ? <p className="tv-band-serve">{payload.serve}</p> : null}
          {payload.alt ? <p className="tv-band-note">{payload.alt}</p> : null}
        </>
      ),
    });
    if (payload.lines.length) cols.push({
      key: "ing", weight: 35, body: (
        <>
          <p className="tv-band-label">Ingredients</p>
          <div className="tv-band-ing">
            {payload.lines.map((l, i) => (
              <div key={i} className="tv-band-line">
                <span className="amt">{l.amount}</span>
                <span className={`what${l.out ? " out" : ""}`}>
                  {l.name}
                  {l.out || l.use_instead || l.optional || l.note ? (
                    <small>
                      {l.out ? <span className="tv-tag">out tonight</span> : null}
                      {[l.use_instead ? `use ${l.use_instead}` : null, l.optional ? "(optional)" : null, l.note].filter(Boolean).join(" · ")}
                    </small>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        </>
      ),
    });
    if (payload.method.length) cols.push({
      key: "method", weight: 35, body: (
        <>
          <p className="tv-band-label">{payload.method_label}</p>
          {payload.method.map((p, i) => <p key={i} className="tv-band-text">{p}</p>)}
        </>
      ),
    });
  } else {
    cols.push({
      key: "hero", weight: 30, body: (
        <>
          <GlassIcon glass={payload.glass} className="tv-band-glass" />
          <h3 className="tv-band-name">{payload.name}</h3>
          {payload.detail ? <p className="tv-band-serve">{payload.detail}</p> : null}
        </>
      ),
    });
    cols.push({
      key: "serve", weight: 35, body: (
        <>
          <p className="tv-band-label">How it&rsquo;s served</p>
          <p className="tv-band-text">{payload.serve}</p>
          {payload.serve_quiet.map((q, i) => <p key={i} className="tv-band-text quiet">{q}</p>)}
        </>
      ),
    });
    if (payload.note) cols.push({
      key: "note", weight: 35, body: (
        <>
          <p className="tv-band-label">Tasting note</p>
          <p className="tv-band-text">{payload.note}</p>
        </>
      ),
    });
  }

  return (
    <div ref={ref} className="tv-band-inner" style={{ gridTemplateColumns: cols.map((c) => `${c.weight}fr`).join(" "), ["--band-scale" as string]: scale }}>
      {cols.map((c) => <div key={c.key} className={`tv-band-col tv-band-col-${c.key}`}>{c.body}</div>)}
    </div>
  );
}
