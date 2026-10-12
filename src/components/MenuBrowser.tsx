"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { DecantBadge } from "@/components/DecantBadge";
import { FeaturedTag } from "@/components/FeaturedTag";
import { GlassIcon, glassFootDrop } from "@/components/GlassIcon";
import { ReservedTag } from "@/components/ReservedIcon";
import type { SectionId } from "@/lib/menu";
import { readMenuMemory, writeMenuMemory } from "@/lib/menu-memory";
import {
  NO_PICK, baseFilter, grapeInColor, markRanges, noteExcerpt, sectionChips, sectionItems, validPicks, visibleMoods, words,
  type BrowseItem, type BrowseSection, type Filters, type SectionPick,
} from "@/lib/menu-filter";

type Tab = "all" | SectionId;
const EMPTY_PICKS: Record<SectionId, SectionPick> = { pours: NO_PICK, cocktails: NO_PICK, cellar: NO_PICK };

/**
 * Phone guest menu with search and filters (Brian via Rachel, 2026-10-04; the approved mock-up in
 * mixology-review/search-mockup). A sticky search box and tabs (All · Pours · Cocktails · Cellar; no counts);
 * mood chips (Brian's moods with 2+ items tonight; no "Top rated" chip, Brian via Vincent 2026-10-04: the ★ ratings
 * stay on the cards, but the menu isn't filtered by them); per-section chips (Pours by spirit,
 * Cocktails Stirred · Shaken · Hot, Cellar color then grape; no "All" chip: nothing chosen shows everything, and a
 * chosen chip toggles off). All chip rows wrap (no sideways scroll). A section with
 * nothing left collapses to "No matches"; when nothing matches anywhere, one "No matches · Clear filters" line
 * replaces the sections. No visible result line (Brian via Vincent, 2026-10-04: it cost phone space); screen
 * readers still hear the count from a hidden live region. Section titles (with their count) pin under the bar while
 * their section scrolls by (Brian via Vincent, 2026-10-04): plain CSS sticky inside each section, so the next title
 * pushes the old one up; see the pin line below. All in the browser: the menu is small, and nothing is
 * sent anywhere.
 * The TV board is separate and unchanged.
 */
export function MenuBrowser({ sections, initialTab }: { sections: BrowseSection[]; initialTab: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [q, setQ] = useState("");
  const [mood, setMood] = useState<string | null>(null);
  const [picks, setPicks] = useState<Record<SectionId, SectionPick>>(EMPTY_PICKS);
  const [stuck, setStuck] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);

  // Remembered for the visit (lib/menu-memory.ts, sessionStorage): search, mood, section chips, tab
  // and scroll come back when the guest returns from a drink, by browser back or any link to /menu. The saved
  // tab wins over ?tab= from a back link. Applied before the first paint (layout effect); the scroll is applied
  // after the restored list has rendered and again on the next frame, after the router's own scroll-to-top.
  const restoreY = useRef<number | null>(null);
  const [restored, setRestored] = useState(false);
  const ready = useRef(false); // saving starts once the restore is done, so the restore never saves over itself
  useLayoutEffect(() => {
    const m = readMenuMemory(["all", ...sections.map((s) => s.id)]);
    if (m) {
      setTab(m.tab); setQ(m.q); setMood(m.mood); setPicks(validPicks(sections, m.picks));
      restoreY.current = m.y;
    }
    setRestored(true);
  }, []);
  useLayoutEffect(() => {
    if (!restored) return;
    const y = restoreY.current;
    const done = () => {
      ready.current = true;
      document.documentElement.removeAttribute("data-menu-restore");
      // Write back what was actually restored, so anything dropped on the way in (e.g. a grape without a color) is gone.
      writeMenuMemory({ ...state.current, y: window.scrollY });
    };
    if (y == null) return done();
    window.scrollTo(0, y);
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      window.scrollTo(0, y);
      raf2 = requestAnimationFrame(() => { window.scrollTo(0, y); done(); });
    });
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
  }, [restored]);

  const f: Filters = { q, mood, picks };
  const ws = words(q);
  const searching = ws.length > 0;
  const moods = useMemo(() => visibleMoods(sections), [sections]);
  // A mood that disappears after a data refresh (fewer than 2 items now) stops filtering.
  const moodOn = mood && moods.some((m) => m.mood === mood) ? mood : null;
  const fx: Filters = { ...f, mood: moodOn };

  // Tab in the address bar (?tab=), so a reload or a shared link keeps it; no history entries.
  useEffect(() => {
    const url = tab === "all" ? "/menu" : `/menu?tab=${tab}`;
    if (window.location.pathname + window.location.search !== url) window.history.replaceState(window.history.state, "", url);
  }, [tab]);
  // Save on every change (clearing saves the cleared state; the default state removes the entry) and on scroll.
  const state = useRef({ tab, q, mood, picks });
  state.current = { tab, q, mood, picks };
  useEffect(() => {
    if (ready.current) writeMenuMemory({ tab, q, mood, picks, y: window.scrollY });
  }, [tab, q, mood, picks, restored]);
  useEffect(() => {
    let raf = 0;
    const save = () => {
      // Only while this page is showing: leaving for a drink scrolls the next page to the top.
      if (!ready.current || !root.current?.isConnected) return;
      writeMenuMemory({ ...state.current, y: window.scrollY });
    };
    const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(save); };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", save);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("scroll", onScroll); window.removeEventListener("pagehide", save); };
  }, []);
  // The search bar gets a hairline and shadow once it is pinned.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting), { rootMargin: "-120px 0px 0px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Sticky section titles. The push-up is pure CSS (each .sec-head is sticky inside its own section). JS only
  // measures the pin line, the bottom of the sticky search bar (its CSS top + its real height), into --s-pin on
  // .browse with a ResizeObserver, before the first paint, so a title never leaves a gap under the bar or slides
  // under it; and one IntersectionObserver marks the title that is pinned (data-pinned) for its hairline. Neither
  // changes layout, so the remembered scroll restores exactly.
  const heads = useRef(new Set<HTMLElement>());
  const headIO = useRef<IntersectionObserver | null>(null);
  const watchHeads = useCallback((pin: number) => {
    headIO.current?.disconnect();
    if (typeof IntersectionObserver === "undefined") return;
    // The root starts 1px under the pin line: a pinned title (top at the line) is then cut by 1px, a title resting
    // lower in the list is not, and one pushed fully under the bar no longer intersects.
    const io = new IntersectionObserver((es) => {
      for (const e of es) {
        const pinned = e.isIntersecting && !!e.rootBounds && e.boundingClientRect.top < e.rootBounds.top;
        (e.target as HTMLElement).toggleAttribute("data-pinned", pinned);
      }
    }, { rootMargin: `${-Math.ceil(pin + 1)}px 0px 0px 0px`, threshold: [0, 1] });
    heads.current.forEach((el) => io.observe(el));
    headIO.current = io;
  }, []);
  const headRef = useCallback((el: HTMLDivElement | null) => {
    // React calls this with the element on mount and null on unmount; keep the set in step.
    heads.current.forEach((h) => { if (!h.isConnected) { heads.current.delete(h); headIO.current?.unobserve(h); } });
    if (el && !heads.current.has(el)) { heads.current.add(el); headIO.current?.observe(el); }
  }, []);
  useLayoutEffect(() => {
    const el = bar.current, box = root.current;
    if (!el || !box) return;
    let last = -1;
    const measure = () => {
      const pin = (parseFloat(getComputedStyle(el).top) || 0) + el.getBoundingClientRect().height;
      if (Math.abs(pin - last) < 0.25) return;
      last = pin;
      box.style.setProperty("--s-pin", `${pin}px`);
      watchHeads(pin);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return () => headIO.current?.disconnect();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure); // the bar's top uses the safe-area inset, which can change on rotate
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); headIO.current?.disconnect(); };
  }, [watchHeads]);

  const totals = Object.fromEntries(sections.map((s) => [s.id, s.items.length])) as Record<SectionId, number>;
  const total = sections.reduce((n, s) => n + s.items.length, 0);
  const filtered = searching || !!moodOn;
  // Tabs carry no numbers (Brian via Vincent, 2026-10-04); a tab with nothing left under the filters is still dimmed,
  // and the hidden live region reads the counts.
  const tabCount = (id: SectionId) => (filtered ? baseFilter(sections.find((s) => s.id === id)!.items, fx).length : totals[id]);
  const allCount = sections.reduce((n, s) => n + tabCount(s.id), 0);
  const shown = sections.filter((s) => tab === "all" || s.id === tab);
  const shownItems = shown.map((s) => ({ s, items: sectionItems(s, fx) }));
  const pickLabels = searching ? [] : shown.flatMap((s) => [picks[s.id]?.chip, picks[s.id]?.grape]).filter((x): x is string => !!x);
  const anything = filtered || pickLabels.length > 0;

  // "Clear filters" on the empty line: search, mood, section chips (none chosen), and back to the All tab.
  function clear() {
    setQ(""); setMood(null); setPicks(EMPTY_PICKS); setTab("all");
  }
  // A mood chip (Brian via Vincent, 2026-10-04): choosing a mood, or switching to another one, sets every section's
  // chips back to none chosen (Pours spirit, Cocktails style, Cellar color and grape), so the mood shows its whole list;
  // turning the mood off changes nothing else. Search and tab stay. The save effect stores the reset, so a reload
  // or back restores it, and the live region's count follows on its own.
  function pickMood(m: string) {
    if (moodOn === m) { setMood(null); return; }
    setMood(m);
    setPicks(EMPTY_PICKS);
  }
  // Section chips have no "All" chip (Brian via Vincent, 2026-10-04): nothing chosen shows the whole section, and
  // tapping the chosen chip again turns it off. Turning a Cellar color off clears its grape too (grapes only show
  // under a color).
  function pick(s: BrowseSection, label: string, kind: "chip" | "grape") {
    setPicks((o) => {
      const cur = o[s.id] ?? NO_PICK;
      let next: SectionPick;
      // A new color keeps the chosen grape only if some wine of that color has it; the grape row shows only that color's grapes.
      if (kind === "chip") next = cur.chip === label ? NO_PICK : { chip: label, grape: cur.grape && label && grapeInColor(s, cur.grape, label) ? cur.grape : null };
      else next = cur.grape === label ? { ...cur, grape: null } : { chip: cur.chip, grape: label };
      return { ...o, [s.id]: next };
    });
  }

  const noun = (s: BrowseSection, n: number) => (n === 1 ? s.noun[0] : s.noun[1]);
  const scope = tab === "all" ? null : sections.find((s) => s.id === tab)!;
  const scopeShown = scope ? shownItems[0]?.items.length ?? 0 : shownItems.reduce((n, x) => n + x.items.length, 0);
  const scopeTotal = scope ? totals[scope.id] : total;
  const extras = [moodOn, ...pickLabels].filter(Boolean).join(" · ");
  // Nothing left in any section (picks included), whatever the tab: one empty line instead of the sections.
  const noneAnywhere = anything && sections.every((s) => sectionItems(s, fx).length === 0);
  // The result count, for screen readers only (visually hidden live region; on screen only the section titles carry counts).
  let countText: string;
  if (searching) countText = `${scopeShown} ${scopeShown === 1 ? "match" : "matches"} for “${q.trim()}”${scope ? ` in ${scope.label}` : ""}${extras ? ` · ${extras}` : ""}`;
  else if (anything) countText = `${scopeShown} of ${scopeTotal}${scope ? ` ${noun(scope, scopeTotal)}` : ""} · ${extras}`;
  else countText = scope ? `Showing all ${scopeTotal} ${noun(scope, scopeTotal)}` : `Showing all ${total}${sections.map((s) => ` · ${s.items.length} ${noun(s, s.items.length)}`).join("")}`;

  return (
    // A tap on a card saves the exact scroll first (capture), before the router moves to the drink.
    <div ref={root} className="browse" onClickCapture={() => { if (ready.current) writeMenuMemory({ ...state.current, y: window.scrollY }); }}>
      <div className="s-band" aria-hidden />
      <div ref={sentinel} className="s-sentinel" aria-hidden />
      <div ref={bar} className={`s-sticky${stuck ? " stuck" : ""}`}>
        <form className="search" role="search" onSubmit={(e) => { e.preventDefault(); input.current?.blur(); }}>
          <SearchIcon />
          {/* Only the guest clears the search: the ×, Clear filters, or Escape here (Brian via Vincent, 2026-10-04). */}
          <input ref={input} type="search" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setQ(""); }}
            placeholder="Search drinks, spirits, grapes, notes…" aria-label="Search the menu" enterKeyHint="search" autoComplete="off" autoCorrect="off" spellCheck={false} maxLength={60} />
          {q ? (
            <button type="button" className="x" onClick={() => { setQ(""); input.current?.focus(); }} aria-label="Clear search"><span aria-hidden>×</span></button>
          ) : null}
        </form>
        <nav className="tabs s-tabs" style={{ gridTemplateColumns: `repeat(${sections.length + 1}, 1fr)` }} aria-label="Sections">
          <button type="button" className={`tab${tab === "all" ? " active" : ""}${filtered && allCount === 0 ? " zero" : ""}`} aria-pressed={tab === "all"} onClick={() => setTab("all")}>
            All
          </button>
          {sections.map((s) => {
            const n = tabCount(s.id);
            return (
              <button key={s.id} type="button" className={`tab${tab === s.id ? " active" : ""}${filtered && n === 0 ? " zero" : ""}`} aria-pressed={tab === s.id} onClick={() => setTab(s.id)}>
                {s.label}
              </button>
            );
          })}
        </nav>
      </div>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{countText}</p>

      {moods.length ? (
        <div className="chips mood" role="group" aria-label="Moods">
          {moods.map((m) => (
            <button key={m.mood} type="button" className={`chip${moodOn === m.mood ? " on" : ""}`} data-label={m.mood} aria-pressed={moodOn === m.mood} onClick={() => pickMood(m.mood)}>
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
            <section key={s.id} className="sec" data-section={s.id} aria-label={s.label}>
              <div ref={headRef} className="sec-head"><h2>{s.label}</h2><span className="n">{items.length}</span></div>
              {chips.length > 1 || (s.id === "cellar" && chips.length) ? (
                <div className="chips" role="group" aria-label={`${s.label} filters`}>
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
          {item.decanting ? <DecantBadge /> : null}
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
