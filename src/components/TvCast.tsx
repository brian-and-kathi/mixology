"use client";

import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { FeaturedTag } from "@/components/FeaturedTag";
import { GlassIcon } from "@/components/GlassIcon";
import { MoodLine } from "@/components/MoodLine";
import type { Cast, CastPayload } from "@/lib/cast";
import { onBarStatus } from "@/lib/bar-events";
import { RELAY_FALLBACK_MS, useRelay } from "@/lib/use-relay";

// TV side of "Show on TV" (DESIGN §10). Polls /api/cast every 4 s; while something is cast,
// a bottom band slides up and the menu above shrinks to fit, with the cast item highlighted.
// With the realtime relay live, a "bar:cast" notice triggers the fetch instead and the poll
// drops to a slow fallback (plus a check whenever the TV tab comes back into view).
const POLL_MS = 4000;
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

  // Poll the single cast record. A repeat of the same cast is a 304: no new payload, just the clock.
  const pollRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    let stop = false;
    let rev = "";
    const poll = async () => {
      try {
        const res = await fetch("/api/cast", { cache: "no-store", headers: rev ? { "if-none-match": rev } : {} });
        if (res.status === 304) {
          const now = res.headers.get("x-now");
          if (now) offset.current = Date.parse(now) - Date.now();
          return;
        }
        if (res.ok) {
          rev = res.headers.get("etag") ?? "";
          const data = (await res.json()) as { cast: Cast | null; now: string };
          offset.current = Date.parse(data.now) - Date.now();
          if (!stop) setCast((prev) => (prev && data.cast && prev.id === data.cast.id && prev.started_at === data.cast.started_at && JSON.stringify(prev.payload) === JSON.stringify(data.cast.payload) ? prev : data.cast));
        }
      } catch {
        // Network blip: keep showing what we have; the clock still ends it on time.
      }
    };
    pollRef.current = poll;
    void poll();
    return () => {
      stop = true;
      pollRef.current = async () => {};
    };
  }, []);
  const relayLive = useRelay("bar:cast", () => void pollRef.current());
  // The bar opened or closed (BarWatch): a cast from before a close is over, so ask again now.
  useEffect(() => onBarStatus(() => void pollRef.current()), []);
  useEffect(() => {
    const id = window.setInterval(() => void pollRef.current(), relayLive ? RELAY_FALLBACK_MS : POLL_MS);
    if (!relayLive) return () => window.clearInterval(id);
    const onVis = () => { if (!document.hidden) void pollRef.current(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [relayLive]);

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

  // Guests' rating for the cast item, fetched once when a cast appears (not refreshed during the cast).
  const castKey = shown ? `${shown.type}:${shown.id}:${shown.started_at}` : null;
  const castType = shown?.type, castId = shown?.id;
  const [rating, setRating] = useState<{ key: string; avg: number | null } | null>(null);
  useEffect(() => {
    if (!castKey || !castType || !castId) return;
    let stop = false;
    const kind = castType === "recipe" ? "recipe" : "product";
    fetch(`/api/rate?kind=${kind}&id=${castId}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ avg: number | null; votes: number }>) : null))
      .then((d) => { if (!stop && d) setRating({ key: castKey, avg: d.votes > 0 ? d.avg : null }); })
      .catch(() => {}); // no stars is fine
    return () => { stop = true; };
  }, [castKey, castType, castId]);
  const avg = rating && rating.key === castKey ? rating.avg : null;

  const highlight = open && shown ? { type: shown.type, id: shown.id } : null;
  const remaining = shown ? Math.max(0, Date.parse(shown.expires_at) - serverNow) : 0;

  return (
    <CastContext.Provider value={highlight}>
      <div className={`tv${open ? " tv-casting" : ""}`}>
        {children}
        {shown ? (
          <section className={`tv-band${open ? " open" : ""}`} aria-live="polite" aria-label={`On the TV: ${shown.payload.name}`}>
            <div className="tv-band-progress" aria-hidden>
              {/* Keyed by cast: a new cast (or a re-cast) remounts the bar at full width, never animating back. */}
              <CastBar key={`${shown.type}:${shown.id}:${shown.started_at}`} startedAt={shown.started_at} expiresAt={shown.expires_at} serverOffset={offset.current} />
            </div>
            <span className="tv-band-clock">{mss(remaining)}</span>
            <BandBody payload={shown.payload} avg={avg} />
          </section>
        ) : null}
      </div>
    </CastContext.Provider>
  );
}

/**
 * Countdown bar: shrinks from both ends to nothing in the middle (scaleX from the center), linear over
 * the whole cast. Timed from the cast's server started_at / expires_at, not from when this TV saw it:
 * a negative animation-delay starts it part-way, so after a reload mid-cast it shows the true remainder
 * and reaches zero exactly at expires_at. The delay is fixed at mount so re-renders never make it jump.
 */
function CastBar({ startedAt, expiresAt, serverOffset }: { startedAt: string; expiresAt: string; serverOffset: number }) {
  const [timing] = useState(() => {
    const start = Date.parse(startedAt), end = Date.parse(expiresAt);
    const total = Math.max(1, end - start);
    const elapsed = Math.min(total, Math.max(0, Date.now() + serverOffset - start));
    return { animationDuration: `${total}ms`, animationDelay: `${-elapsed}ms` };
  });
  return <div className="tv-band-fill" style={timing} />;
}

const STAR = "M12 2.6l2.82 6.06 6.63.72-4.95 4.47 1.38 6.53L12 17.1l-5.88 3.28 1.38-6.53-4.95-4.47 6.63-.72z";
const STAR_BOX = 24, STAR_GAP = 7, STAR_L = 2.55, STAR_W = 18.9; // viewBox units; the star's drawn left edge and width

/**
 * Five stars beside the band's glass, filled to the guests' average: whole stars, then the next one
 * clipped to the fraction of its drawn width (4.2 = four full, the fifth ~20%). Gold fill over quiet
 * outlines, like the phone. No number. With no ratings the row is kept but invisible, so rated and
 * unrated casts lay out the same.
 */
function BandStars({ avg }: { avg: number | null }) {
  const clip = `tvstars${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const v = avg == null ? 0 : Math.min(5, Math.max(0, avg));
  const full = Math.floor(v);
  const edge = full >= 5 ? 5 * STAR_BOX + 4 * STAR_GAP + 2 : full * (STAR_BOX + STAR_GAP) + (v > full ? STAR_L + (v - full) * STAR_W : 0);
  const width = 5 * STAR_BOX + 4 * STAR_GAP;
  const stars = (cls: string) => [0, 1, 2, 3, 4].map((i) => <path key={i} className={cls} d={STAR} transform={`translate(${i * (STAR_BOX + STAR_GAP)} 0)`} />);
  return (
    <svg className="tv-band-stars" viewBox={`0 0 ${width} ${STAR_BOX}`} style={avg == null ? { visibility: "hidden" } : undefined}
      role={avg == null ? undefined : "img"} aria-label={avg == null ? undefined : `Rated ${avg.toFixed(1)} of 5`} aria-hidden={avg == null ? true : undefined}>
      <defs><clipPath id={clip}><rect x={-2} y={-2} width={edge + 2} height={STAR_BOX + 4} /></clipPath></defs>
      {stars("tv-star-empty")}
      <g clipPath={`url(#${clip})`}>{stars("tv-star-full")}</g>
    </svg>
  );
}

/** The band's columns (30/35/35). Empty columns are left out; long content is scaled down to fit. */
function BandBody({ payload, avg }: { payload: CastPayload; avg: number | null }) {
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
          {payload.glass ? (
            <div className="tv-band-lead">
              <GlassIcon glass={payload.glass} className="tv-band-glass" />
              <BandStars avg={avg} />
            </div>
          ) : null}
          <h3 className="tv-band-name">{payload.name}</h3>
          {/* Moods (Brian via Vincent, 2026-10-04): the /menu chip labels on one quiet line under the name; none, no line. */}
          <MoodLine moods={payload.moods} className="tv-band-moods" />
          {payload.featured ? <p className="tv-band-feat"><FeaturedTag /></p> : null}
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
                  {l.bottle_parts ? (
                    <small className="tv-band-bottles">
                      {l.bottle_parts.map((part, j) =>
                        part.featured ? <span key={j}><span className="feat-name">{part.text}</span><FeaturedTag /></span> : part.text)}
                    </small>
                  ) : l.bottles ? <small className="tv-band-bottles">{l.bottles}</small> : null}
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
  } else if (payload.type === "wine") {
    // Cellar wine (Brian via Rachel, 2026-10-06): the pour card's three columns. Hero: glass and stars, name, grape
    // badge(s), Featured, then "Producer · City, ST" and "Color · vintage · ABV". Missing facts are simply left out.
    const place = [payload.producer, payload.origin].filter(Boolean).join(" \u00b7 ");
    const facts = [payload.color, payload.vintage, payload.abv].filter(Boolean).join(" \u00b7 ");
    cols.push({
      key: "hero", weight: 30, body: (
        <>
          <div className="tv-band-lead">
            <GlassIcon glass={payload.glass} className="tv-band-glass" />
            <BandStars avg={avg} />
          </div>
          <h3 className="tv-band-name">{payload.name}</h3>
          {payload.grapes.length ? (
            <ul className="tv-band-grapes" aria-label={payload.grapes.length > 1 ? "Grapes" : "Grape"}>
              {payload.grapes.map((g) => <li key={g} className="tv-band-grape">{g}</li>)}
            </ul>
          ) : null}
          {payload.featured ? <p className="tv-band-feat"><FeaturedTag /></p> : null}
          {place ? <p className="tv-band-serve">{place}</p> : null}
          {facts ? <p className="tv-band-note">{facts}</p> : null}
        </>
      ),
    });
    if (payload.temp || payload.serve_note) cols.push({
      key: "serve", weight: 35, body: (
        <>
          <p className="tv-band-label">How it&rsquo;s served</p>
          {payload.temp ? <p className="tv-band-text">{payload.temp}</p> : null}
          {payload.serve_note ? <p className="tv-band-text quiet">{payload.serve_note}</p> : null}
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
  } else {
    cols.push({
      key: "hero", weight: 30, body: (
        <>
          <div className="tv-band-lead">
            <GlassIcon glass={payload.glass} className="tv-band-glass" />
            <BandStars avg={avg} />
          </div>
          <h3 className="tv-band-name">{payload.name}</h3>
          {payload.featured ? <p className="tv-band-feat"><FeaturedTag /></p> : null}
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
