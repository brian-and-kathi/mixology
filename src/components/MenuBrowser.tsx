"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { FeaturedTag } from "@/components/FeaturedTag";
import { GlassIcon, glassFootDrop } from "@/components/GlassIcon";
import { ReservedTag } from "@/components/ReservedIcon";
import type { SectionId } from "@/lib/menu";
import {
  NO_PICK, baseFilter, grapeInColor, markRanges, noteExcerpt, sectionChips, sectionItems, visibleMoods, words,
  type BrowseItem, type BrowseSection, type Filters, type SectionPick,
} from "@/lib/menu-filter";

type Tab = "all" | SectionId;
const EMPTY_PICKS: Record<SectionId, SectionPick> = { pours: NO_PICK, cocktails: NO_PICK, cellar: NO_PICK };

/**
 * Phone guest menu with search and filters (Brian via Rachel, 2026-10-04; the approved mock-up in
 * mixology-review/search-mockup). A sticky search box and tabs (All · Pours · Cocktails · Cellar, with counts);
 * mood chips ("Top rated ★", then Brian's moods with 2+ items tonight); per-section chips (Pours by spirit,
 * Cocktails Stirred · Shaken · Hot, Cellar color then grape). All chip rows wrap (no sideways scroll). A section with
 * nothing left collapses to "No matches"; when nothing matches anywhere, one "No matches · Clear filters" line
 * replaces the sections. No visible result line (Brian via Vincent, 2026-10-04: it cost phone space); screen
 * readers still hear the count from a hidden live region. All in the browser: the menu is small, and nothing is
 * sent anywhere.
 * The TV board is separate and unchanged.
 */
export function MenuBrowser({ sections, initialTab }: { sections: BrowseSection[]; initialTab: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [q, setQ] = useState("");
  const [mood, setMood] = useState<string | null>(null);
  const [top, setTop] = useState(false);
  const [picks, setPicks] = useState<Record<SectionId, SectionPick>>(EMPTY_PICKS);
  const [stuck, setStuck] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const f: Filters = { q, mood, top, picks };
  const ws = words(q);
  const searching = ws.length > 0;
  const moods = useMemo(() => visibleMoods(sections), [sections]);
  // A mood that disappears after a data refresh (fewer than 2 items now) stops filtering.
  const moodOn = mood && moods.some((m) => m.mood === mood) ? mood : null;
  const fx: Filters = { ...f, mood: moodOn };
  const hasRated = sections.some((s) => s.items.some((it) => it.rating != null));

  // Tab in the address bar (?tab=), so a reload or a shared link keeps it; no history entries.
  useEffect(() => {
    const url = tab === "all" ? "/menu" : `/menu?tab=${tab}`;
    if (window.location.pathname + window.location.search !== url) window.history.replaceState(window.history.state, "", url);
  }, [tab]);
  // The search bar gets a hairline and shadow once it is pinned.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting), { rootMargin: "-120px 0px 0px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const totals = Object.fromEntries(sections.map((s) => [s.id, s.items.length])) as Record<SectionId, number>;
  const total = sections.reduce((n, s) => n + s.items.length, 0);
  const filtered = searching || !!moodOn || top;
  const tabCount = (id: SectionId) => (filtered ? baseFilter(sections.find((s) => s.id === id)!.items, fx).length : totals[id]);
  const allCount = sections.reduce((n, s) => n + tabCount(s.id), 0);
  const shown = sections.filter((s) => tab === "all" || s.id === tab);
  const shownItems = shown.map((s) => ({ s, items: sectionItems(s, fx) }));
  const pickLabels = searching ? [] : shown.flatMap((s) => [picks[s.id]?.chip, picks[s.id]?.grape]).filter((x): x is string => !!x);
  const anything = filtered || pickLabels.length > 0;

  // "Clear filters" on the empty line: search, mood, Top rated, section chips, and back to All.
  function clear() {
    setQ(""); setMood(null); setTop(false); setPicks(EMPTY_PICKS); setTab("all");
  }
  function pick(s: BrowseSection, label: string | null, kind: "chip" | "grape" | "all") {
    setPicks((o) => {
      const cur = o[s.id] ?? NO_PICK;
      let next: SectionPick;
      if (kind === "all") next = NO_PICK;
      // A new color keeps the chosen grape only if some wine of that color has it; the grape row shows only that color's grapes.
      else if (kind === "chip") next = cur.chip === label ? NO_PICK : { chip: label, grape: cur.grape && label && grapeInColor(s, cur.grape, label) ? cur.grape : null };
      else next = cur.grape === label ? { ...cur, grape: null } : { chip: cur.chip, grape: label };
      return { ...o, [s.id]: next };
    });
  }

  const noun = (s: BrowseSection, n: number) => (n === 1 ? s.noun[0] : s.noun[1]);
  const scope = tab === "all" ? null : sections.find((s) => s.id === tab)!;
  const scopeShown = scope ? shownItems[0]?.items.length ?? 0 : shownItems.reduce((n, x) => n + x.items.length, 0);
  const scopeTotal = scope ? totals[scope.id] : total;
  const extras = [top ? "Top rated" : null, moodOn, ...pickLabels].filter(Boolean).join(" · ");
  // Nothing left in any section (picks included), whatever the tab: one empty line instead of the sections.
  const noneAnywhere = anything && sections.every((s) => sectionItems(s, fx).length === 0);
  // The result count, for screen readers only (visually hidden live region; the tabs carry the counts on screen).
  let countText: string;
  if (searching) countText = `${scopeShown} ${scopeShown === 1 ? "match" : "matches"} for “${q.trim()}”${scope ? ` in ${scope.label}` : ""}${extras ? ` · ${extras}` : ""}`;
  else if (anything) countText = `${scopeShown} of ${scopeTotal}${scope ? ` ${noun(scope, scopeTotal)}` : ""} · ${extras}`;
  else countText = scope ? `Showing all ${scopeTotal} ${noun(scope, scopeTotal)}` : `Showing all ${total}${sections.map((s) => ` · ${s.items.length} ${noun(s, s.items.length)}`).join("")}`;

  return (
    <div className="browse">
      <div className="s-band" aria-hidden />
      <div ref={sentinel} className="s-sentinel" aria-hidden />
      <div className={`s-sticky${stuck ? " stuck" : ""}`}>
        <form className="search" role="search" onSubmit={(e) => { e.preventDefault(); input.current?.blur(); }}>
          <SearchIcon />
          <input ref={input} type="search" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setQ(""); }}
            placeholder="Search drinks, spirits, grapes, notes…" aria-label="Search the menu" enterKeyHint="search" autoComplete="off" autoCorrect="off" spellCheck={false} maxLength={60} />
          {q ? (
            <button type="button" className="x" onClick={() => { setQ(""); input.current?.focus(); }} aria-label="Clear search"><span aria-hidden>×</span></button>
          ) : null}
        </form>
        <nav className="tabs s-tabs" style={{ gridTemplateColumns: `repeat(${sections.length + 1}, 1fr)` }} aria-label="Sections">
          <button type="button" className={`tab${tab === "all" ? " active" : ""}${filtered && allCount === 0 ? " zero" : ""}`} aria-pressed={tab === "all"} onClick={() => setTab("all")}>
            All{filtered ? <span className="n">{allCount}</span> : null}
          </button>
          {sections.map((s) => {
            const n = tabCount(s.id);
            return (
              <button key={s.id} type="button" className={`tab${tab === s.id ? " active" : ""}${filtered && n === 0 ? " zero" : ""}`} aria-pressed={tab === s.id} onClick={() => setTab(s.id)}>
                {s.label}<span className="n">{n}</span>
              </button>
            );
          })}
        </nav>
      </div>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{countText}</p>

      {hasRated || moods.length ? (
        <div className="chips mood" role="group" aria-label="Moods">
          {hasRated ? (
            <button type="button" className={`chip${top ? " on" : ""}`} aria-pressed={top} onClick={() => setTop((t) => !t)}>
              Top rated <span className="star" aria-hidden>★</span>
            </button>
          ) : null}
          {hasRated && moods.length ? <span className="chip-sep" aria-hidden /> : null}
          {moods.map((m) => (
            <button key={m.mood} type="button" className={`chip${moodOn === m.mood ? " on" : ""}`} aria-pressed={moodOn === m.mood} onClick={() => setMood((o) => (o === m.mood ? null : m.mood))}>
              {m.mood}
            </button>
          ))}
        </div>
      ) : null}

      {noneAnywhere ? (
        <p className="s-empty">
          No matches<span className="dot" aria-hidden>·</span><button type="button" className="clear" onClick={clear}>Clear filters</button>
        </p>
      ) : null}
      <div className="sections">
        {noneAnywhere ? null : shownItems.map(({ s, items }) => {
          if (!items.length) {
            return (
              <section key={s.id} className="sec sec-empty" aria-label={s.label}>
                <div className="sec-head"><h2>{s.label}</h2><span className="none">No matches</span></div>
              </section>
            );
          }
          const chips = searching ? [] : sectionChips(s, fx);
          const cur = picks[s.id] ?? NO_PICK;
          return (
            <section key={s.id} className="sec" aria-label={s.label}>
              <div className="sec-head"><h2>{s.label}</h2><span className="n">{items.length}</span></div>
              {chips.length > 1 || (s.id === "cellar" && chips.length) ? (
                <div className="chips" role="group" aria-label={`${s.label} filters`}>
                  <button type="button" className={`chip sm${!cur.chip && !cur.grape ? " on" : ""}`} aria-pressed={!cur.chip && !cur.grape} onClick={() => pick(s, null, "all")}>All</button>
                  {chips.map((c, i) => {
                    const on = c.kind === "grape" ? cur.grape === c.label : cur.chip === c.label;
                    return (
                      <Fragment key={c.kind + c.label}>
                        {c.kind === "grape" && chips[i - 1]?.kind !== "grape" ? <span className="chip-sep" aria-hidden /> : null}
                        <button type="button" className={`chip sm${on ? " on" : ""}${c.dim && !on ? " dim" : ""}`} aria-pressed={on} onClick={() => pick(s, c.label, c.kind)}>
                          {c.label}
                        </button>
                      </Fragment>
                    );
                  })}
                </div>
              ) : null}
              <ul className="cards">
                {items.map((item, i) => <Card key={item.id} item={item} ws={ws} famStart={!!item.famStart && i > 0 && items.length === s.items.length} />)}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </svg>
  );
}

/** The search words marked in a piece of text; unmarked runs keep hyphenated words whole. */
function Marked({ text, ws }: { text: string; ws: string[] }) {
  const ranges = markRanges(text, ws);
  if (!ranges.length) return <>{keepHyphens(text)}</>;
  const out: ReactNode[] = [];
  let at = 0;
  ranges.forEach(([a, b], i) => {
    if (a > at) out.push(<Fragment key={`t${i}`}>{keepHyphens(text.slice(at, a))}</Fragment>);
    out.push(<mark key={`m${i}`}>{text.slice(a, b)}</mark>);
    at = b;
  });
  if (at < text.length) out.push(<Fragment key="end">{keepHyphens(text.slice(at))}</Fragment>);
  return <>{out}</>;
}

/** One menu card, as before (glass, rating, name, Featured/Reserved tags, detail line, Pours corner badge), with search marks. */
function Card({ item, ws, famStart }: { item: BrowseItem; ws: string[]; famStart: boolean }) {
  const rating = item.rating;
  // Taller glasses (highball, collins) end lower: move the rating down by the difference so it clears the foot.
  const drop = rating != null ? glassFootDrop(item.glass) : 0;
  const excerpt = noteExcerpt(item, ws);
  const body = (
    <>
      {/* Glass, and under it the guests' average ("4.2 ★", as on the TV board). Out of flow: same card height, same column. */}
      <span className="card-lead" style={drop ? ({ "--card-rating-drop": `${drop}rem` } as CSSProperties) : undefined}>
        <GlassIcon glass={item.glass} />
        {rating != null ? (
          <span className="card-rating" role="img" aria-label={`Rated ${rating.toFixed(1)} of 5`}>
            <span className="card-rating-num">{rating.toFixed(1)}</span>
            <span className="card-rating-star" aria-hidden>★</span>
          </span>
        ) : null}
      </span>
      <span className="item-text">
        <span className="item-name">
          {/* Pours: an invisible copy of the badge floated at the right of the name's first line keeps the room
              the corner badge takes, plus 8px, so the name wraps before it and never runs under it. */}
          {item.spec ? <span className="spec-badge badge-reserve" aria-hidden>{item.spec}</span> : null}
          {item.reserved ? <span className="res-dim"><Marked text={item.name} ws={ws} /></span> : <Marked text={item.name} ws={ws} />}
          {/* Featured (migration 030): sorted first (lib/menu.ts), copper hairline and this tag. */}
          {item.featured ? <FeaturedTag /> : null}
          {/* Reserved (migration 032): dimmed, after the available items, brass key tag; the link opens the locked page. */}
          {item.reserved ? <ReservedTag /> : null}
        </span>
        {item.detail ? <ItemDetail text={item.detail} origin={item.origin} ws={ws} /> : null}
        {excerpt ? <span className="item-match"><Marked text={excerpt} ws={ws} /></span> : null}
      </span>
      {/* Pours: the type badge as a tab in the card's top-right corner, out of flow. */}
      {item.spec ? <span className="spec-badge corner-badge"><Marked text={item.spec} ws={ws} /></span> : null}
    </>
  );
  const two = (item.detail || excerpt ? " two-line" : "") + (item.spec ? " has-badge" : "") + (item.featured ? " is-featured" : "") + (item.reserved ? " is-reserved" : "");
  return (
    // Pours: a little extra space above the first bottle of each spirit family (only when the list isn't narrowed).
    <li className={famStart ? "fam-start" : undefined}>
      {item.href ? <Link href={item.href} className={`card${two}`}>{body}</Link> : <div className={`card card-static${two}`}>{body}</div>}
    </li>
  );
}

/**
 * Browsers may wrap after a hyphen ("semi-" / "dry"). Words that are kept whole with no-break spaces
 * (see lib/menu.ts) are wrapped in a nowrap span when they contain one, so lines still only break at " · ".
 */
function ItemDetail({ text, origin, ws }: { text: string; origin?: string | null; ws: string[] }) {
  const place = origin && text.startsWith(origin) ? origin : "";
  const rest = place ? text.slice(place.length) : text;
  return (
    <span className="item-detail">
      {place ? <span className="origin"><Marked text={place} ws={ws} /></span> : null}
      <Marked text={rest} ws={ws} />
    </span>
  );
}

function keepHyphens(text: string): ReactNode {
  const parts = text.split(/([^ ]*-[^ ]*)/);
  if (parts.length === 1) return text;
  return parts.map((part, i) => (i % 2 ? <span key={i} className="nobr">{part}</span> : part));
}
