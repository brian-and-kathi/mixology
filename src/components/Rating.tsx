"use client";

import { useState, useSyncExternalStore } from "react";

type Kind = "product" | "recipe";
type State = { avg: number | null; votes: number; mine: number | null };

// One tiny store per page so the score under the glass and the stars lower down stay in step without
// a reload. Seeded from the server render, so the first paint already has the real numbers (no shift).
// An entry only counts while its seed matches the page's server numbers, so coming back to a drink
// always starts from fresh server data.
type Entry = { seed: string; s: State };
const store = new Map<string, Entry>();
const listeners = new Set<() => void>();
const set = (key: string, initial: State, s: State) => {
  store.set(key, { seed: JSON.stringify(initial), s });
  listeners.forEach((l) => l());
};
const get = (key: string, initial: State) => {
  const e = store.get(key);
  return e && e.seed === JSON.stringify(initial) ? e.s : initial;
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
function useRating(key: string, initial: State): State {
  return useSyncExternalStore(subscribe, () => get(key, initial), () => initial);
}

const STAR = "M12 2.6l2.82 6.06 6.63.72-4.95 4.47 1.38 6.53L12 17.1l-5.88 3.28 1.38-6.53-4.95-4.47 6.63-.72z";

/** "4.2 ★" under the glass. With no votes yet the line is kept (blank) so the first vote doesn't move anything. */
export function RatingScore({ kind, id, initial }: { kind: Kind; id: string; initial: State }) {
  const r = useRating(`${kind}:${id}`, initial);
  const shown = r.votes > 0 && r.avg != null;
  return (
    <p className="score" aria-label={shown ? `Guests rate it ${r.avg!.toFixed(1)} out of 5` : undefined} aria-hidden={shown ? undefined : true}>
      {shown ? (
        <>
          <span className="score-num">{r.avg!.toFixed(1)}</span>
          <span className="score-star" aria-hidden>★</span>
        </>
      ) : "\u00a0"}
    </p>
  );
}

/** "Rate it" ("Your rating" once voted): five gold stars, one changeable vote per device; the device's own vote shows when it comes back. */
export function RateDrink({ kind, id, name, initial }: { kind: Kind; id: string; name: string; initial: State }) {
  const key = `${kind}:${id}`;
  const r = useRating(key, initial);
  const [hover, setHover] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const vote = async (stars: number | null) => {
    if (busy) return;
    const before = get(key, initial);
    setBusy(true);
    setError(null);
    set(key, initial, { ...before, mine: stars }); // show the choice at once; numbers follow the server
    try {
      const res = await fetch("/api/rate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, id, stars }) });
      const data = (await res.json().catch(() => ({}))) as { avg?: number | null; votes?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Couldn't save your rating.");
      set(key, initial, { avg: data.avg ?? null, votes: data.votes ?? 0, mine: stars });
    } catch (e) {
      set(key, initial, before);
      setError(e instanceof Error ? e.message : "Couldn't save your rating.");
    } finally {
      setBusy(false);
    }
  };

  const lit = hover ?? r.mine ?? 0;
  return (
    <section className="rate">
      <h2>{r.mine ? "Your rating" : "Rate it"}</h2>
      <div className="rate-stars" role="radiogroup" aria-label={`Rate ${name}`} onMouseLeave={() => setHover(null)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={r.mine === n}
            aria-label={`Rate ${n} of 5`}
            className={n <= lit ? "rate-star on" : "rate-star"}
            onMouseEnter={() => setHover(n)}
            onClick={() => vote(n)}
            disabled={busy}
          >
            <svg viewBox="0 0 24 24" aria-hidden focusable="false"><path d={STAR} /></svg>
          </button>
        ))}
      </div>
      <p className="rate-meta quiet" aria-live="polite">
        {error ? (
          <span className="rate-error">{error}</span>
        ) : r.votes > 0 ? (
          `${r.votes} rating${r.votes === 1 ? "" : "s"}${r.mine ? "" : " · Tap a star to add yours"}`
        ) : (
          "Be the first to rate it"
        )}
        {r.mine && !error ? (
          <>
            {" · "}
            <button type="button" className="rate-clear" onClick={() => vote(null)} disabled={busy}>Clear mine</button>
          </>
        ) : null}
      </p>
    </section>
  );
}
