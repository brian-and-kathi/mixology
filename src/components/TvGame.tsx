"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { TV_GAME_TAKEOVER } from "@/components/TvCast";
import { BAR_NAME } from "@/lib/brand";
import { setTvHold } from "@/lib/tv-hold";

/**
 * TV takeover by a Shindig White Elephant game (migration 041; Brian via Vincent, 2026-10-16).
 * Every 4 s: our /api/tv-game (is a Shindig TV set? was "Back to menu" pressed?) and, when set,
 * Shindig's GET <base>/api/tv/<token>/game ({state: idle | live | ended, eventTitle, accent}).
 * A change needs 2 polls in a row that agree. Shindig unreachable or erroring reads as "off": the menu stays,
 * or comes back. live: 3 s "game on" card in the event accent, then a 600 ms crossfade to Shindig's own
 * dashboard (<base>/tv/<token>?embed=1) full screen, with a faint bar logo bottom-left. The game beats any cast
 * in progress, which is dropped (TvCast) and not resumed. ended: 8 s "That's a wrap" card, then the menu comes
 * back at its first page (the board remounts).
 */
const POLL_MS = 4000;
const TIMEOUT_MS = 3500;
const TITLE_MS = 3000;
const WRAP_MS = 8000;
const FADE_MS = 600;
const DEFAULT_ACCENT = "#e8804a";

type Target = { base: string; token: string };
type Reading = { kind: "live" | "ended" | "off"; title: string; accent: string };
type Phase = "menu" | "title" | "game" | "wrap";

const accentOf = (v: unknown) => (typeof v === "string" && v.length < 64 && typeof CSS !== "undefined" && CSS.supports("color", v) ? v : DEFAULT_ACCENT);

async function getJson(url: string): Promise<unknown> {
  const ctl = new AbortController();
  const t = window.setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { cache: "no-store", signal: ctl.signal, credentials: "omit" });
    if (!res.ok) throw new Error(String(res.status));
    return await res.json();
  } finally {
    window.clearTimeout(t);
  }
}

export function TvGame({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("menu");
  const [game, setGame] = useState<{ target: Target; title: string; accent: string } | null>(null);
  const [boardKey, setBoardKey] = useState(0);
  const phaseRef = useRef<Phase>("menu");
  phaseRef.current = phase;

  useEffect(() => {
    let stop = false;
    let last: string | null = null; // previous raw reading
    let confirmed: Reading["kind"] = "off";
    let suppressed = false; // "Back to menu" for the game that is live now
    let handledDismiss: string | null = null;
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(() => { if (!stop) fn(); }, ms));
    const toMenu = () => { setPhase("menu"); setBoardKey((k) => k + 1); };

    const tick = async () => {
      let target: Target | null = null;
      let dismissedAt: string | null = null;
      try {
        const cfg = (await getJson("/api/tv-game")) as { target: Target | null; dismissedAt: string | null };
        target = cfg.target; dismissedAt = cfg.dismissedAt;
      } catch { /* our own API failed: treat as off */ }
      let r: Reading = { kind: "off", title: "", accent: DEFAULT_ACCENT };
      if (target) {
        try {
          const g = (await getJson(`${target.base}/api/tv/${encodeURIComponent(target.token)}/game`)) as { state?: unknown; eventTitle?: unknown; accent?: unknown };
          const kind = g?.state === "live" ? "live" : g?.state === "ended" ? "ended" : "off";
          r = { kind, title: typeof g.eventTitle === "string" ? g.eventTitle.slice(0, 120) : "", accent: accentOf(g.accent) };
        } catch { /* Shindig unreachable or erroring: off */ }
      }
      if (stop) return;
      const raw = `${r.kind}|${target?.base ?? ""}|${target?.token ?? ""}`;
      const agree = raw === last;
      last = raw;
      if (!agree) return; // wait for a second poll that says the same
      const was = confirmed;
      confirmed = r.kind;

      // "Back to menu": a dismissal we haven't handled, while a game is live, hides that game until it stops.
      if (dismissedAt && dismissedAt !== handledDismiss && confirmed === "live") { suppressed = true; handledDismiss = dismissedAt; }
      if (confirmed !== "live") { suppressed = false; if (dismissedAt) handledDismiss = dismissedAt; }

      const p = phaseRef.current;
      if (confirmed === "live" && !suppressed && target) {
        setGame({ target, title: r.title, accent: r.accent });
        if (p === "menu" || p === "wrap") {
          window.dispatchEvent(new Event(TV_GAME_TAKEOVER));
          setPhase("title");
          later(() => { if (phaseRef.current === "title") setPhase("game"); }, TITLE_MS);
        }
      } else if (p === "title" || p === "game") {
        if (confirmed === "ended" && !suppressed && was === "live") {
          setGame((g) => (g ? { ...g, title: r.title || g.title, accent: r.accent } : g));
          setPhase("wrap");
          later(() => { if (phaseRef.current === "wrap") toMenu(); }, WRAP_MS);
        } else toMenu();
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), POLL_MS);
    return () => { stop = true; window.clearInterval(id); timers.forEach((t) => window.clearTimeout(t)); };
  }, []);

  const on = phase !== "menu";
  // Hold the board's AutoRefresh while the game has the screen; a menu change waiting is applied on release.
  useEffect(() => { setTvHold(on); }, [on]);
  useEffect(() => () => setTvHold(false), []);
  const accent = game?.accent ?? DEFAULT_ACCENT;
  return (
    <>
      <div key={boardKey} className="tvg-board" style={{ opacity: on ? 0 : 1, transition: `opacity ${FADE_MS}ms ease` }} aria-hidden={on}>
        {children}
      </div>
      <div className={`tvg-layer${on ? " on" : ""}`} style={{ ["--tvg-accent" as string]: accent, ["--tvg-fade" as string]: `${FADE_MS}ms` }} aria-hidden={!on}>
        {game && (phase === "title" || phase === "game") ? (
          <iframe className={`tvg-frame${phase === "game" ? " on" : ""}`} src={`${game.target.base}/tv/${encodeURIComponent(game.target.token)}?embed=1`} title="Shindig White Elephant" allow="autoplay" />
        ) : null}
        <section className={`tvg-card${phase === "title" ? " on" : ""}`} aria-live="polite">
          <p className="tvg-kicker">{game?.title || "Shindig"}</p>
          <h1 className="tvg-title">White Elephant — game on!</h1>
        </section>
        <section className={`tvg-card${phase === "wrap" ? " on" : ""}`} aria-live="polite">
          <p className="tvg-kicker">{game?.title || "Shindig"}</p>
          <h1 className="tvg-title">That&apos;s a wrap <span aria-hidden>🎁</span></h1>
        </section>
        <span className={`tvg-logo wordmark${phase === "game" ? " on" : ""}`} aria-hidden>{BAR_NAME}</span>
      </div>
    </>
  );
}
