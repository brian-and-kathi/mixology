"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { GlassIcon } from "@/components/GlassIcon";
import { KeyIcon, PadlockIcon } from "@/components/ReservedIcon";

import { useCastHighlight } from "@/components/TvCast";
import type { MenuItem } from "@/lib/menu";
import { ratingKey } from "@/lib/rating-key";

type Column = { id: string; label: string; items: MenuItem[] };

// One slow timer for the whole board. Only used when the menu can't fit on one screen.
const PAGE_MS = 15000;
const FADE_MS = 400;
// Narrowest sub-column we allow before paging instead (keeps names readable across a room).
const MIN_SUBCOL_PX = 420;

/**
 * Assign each row to a "virtual column" so no column is taller than `available` px. `gaps[i]`: the extra space
 * above row i when it starts a new spirit family (Pours), which only counts when the row isn't first in its column.
 * `reserve(col)`: height already taken at the top of a virtual column (featured rows pinned to the first
 * sub-column of every page, migration 030); 0 by default.
 */
function pack(heights: number[], gaps: number[], available: number, reserve: (col: number) => number = () => 0): number[] {
  const out: number[] = [];
  let col = 0;
  let used = reserve(0);
  heights.forEach((h, i) => {
    const gap = used > 0 ? gaps[i] ?? 0 : 0;
    if (used > 0 && used + gap + h > available) {
      col += 1;
      used = reserve(col);
      used += (used > 0 ? gaps[i] ?? 0 : 0) + h;
    } else {
      used += gap + h;
    }
    out[i] = col;
  });
  return out;
}

/**
 * How featured rows (migration 030) look on the TV board. "tag": the copper "Featured" tag, the same size as the
 * gold type badge, at the end of the line under the name ("Gin London Featured"). "star": no tag, a small copper
 * star before the name. Both keep the copper name. Vincent chose between them from the v2 comparison shots.
 */
const TV_FEATURED: "tag" | "star" = "star";

/**
 * Reserved rows (migration 032): the icon before the name. "key": the skeleton key (same as the phone); "padlock":
 * the fallback if the key reads poorly from the couch. The brass "Ask the host" tag ends the line under the name.
 */
const TV_RESERVED_ICON: "key" | "padlock" = "key";

/** Total height of the featured rows (migration 030), pinned to the top of every page's first sub-column. */
function pinnedHeight(items: MenuItem[], heights: number[]): number {
  return items.reduce((sum, it, i) => sum + (it.featured ? heights[i] ?? 0 : 0), 0);
}

/** Unrounded row heights (offsetHeight rounds, and 8 x 0.5px can cost a row at 1024x576). */
function rowHeights(ruler: HTMLElement): number[] {
  return [...ruler.children].map((el) => el.getBoundingClientRect().height);
}

/** Family gap above each row, as the measuring list shows it (every family start has it there; see .fam-start). */
function rowGaps(ruler: HTMLElement): number[] {
  return [...ruler.children].map((el) => parseFloat(getComputedStyle(el).marginTop) || 0);
}

/** Hand out a sub-column budget: every section gets 1, extra goes where it is needed most. */
function allocate(needed: number[], budget: number): number[] {
  const split = needed.map(() => 1);
  let left = budget - split.length;
  while (left > 0) {
    let best = -1;
    let worst = 1;
    needed.forEach((n, i) => {
      const pages = n / split[i];
      if (n > split[i] && pages > worst) {
        worst = pages;
        best = i;
      }
    });
    if (best < 0) break;
    split[best] += 1;
    left -= 1;
  }
  return split;
}

let canvas: HTMLCanvasElement | null = null;
/** Width a column needs so its longest name stays on one line (text + icon + gaps + padding). */
function neededWidth(section: HTMLElement, ruler: HTMLUListElement, n: number): number {
  const row = ruler.firstElementChild as HTMLElement | null;
  const span = row?.querySelector(".tv-name");
  if (!row || !span) return 0;
  canvas ??= document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return 0;
  const rs = getComputedStyle(row);
  ctx.font = `${rs.fontWeight} ${rs.fontSize} ${rs.fontFamily}`;
  // Only names set the width; the detail line under a name truncates with an ellipsis instead.
  // Pours rows are sized by the bottle's full name (data-measure), not the short name and badge, so every
  // column keeps the width it had before badges; the badge fits in that room or moves to the subtext line.
  const text = Math.max(...[...ruler.querySelectorAll<HTMLElement>(".tv-name")].map((el) => ctx.measureText(el.dataset.measure ?? el.textContent ?? "").width));
  const icon = (row.firstElementChild as HTMLElement | null)?.getBoundingClientRect().width ?? 0;
  const perRow = Math.ceil(text + icon + parseFloat(rs.columnGap || "0") + parseFloat(rs.paddingLeft) + parseFloat(rs.paddingRight)) + 2;
  const cs = getComputedStyle(section);
  const subGap = parseFloat(getComputedStyle(ruler.nextElementSibling as HTMLElement).columnGap || "0");
  return n * perRow + (n - 1) * subGap + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + 1;
}

let fitCanvas: HTMLCanvasElement | null = null;
/**
 * One-line subtext with measured truncation: shows the first candidate (longest first, cut only at
 * whole items or words, e.g. "Rye · sweet vermouth · …") that fits the row. Re-measures when the
 * row or the text size changes (column widths, cast shrink, web fonts).
 */
function FitLine({ fit, badge = null, origin = null, featured = false, reserved = false }: { fit: string[]; badge?: string | null; origin?: string | null; featured?: boolean; reserved?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const badgeRef = useRef<HTMLSpanElement>(null);
  const tagRef = useRef<HTMLSpanElement>(null);
  const [text, setText] = useState(fit[0]);
  useLayoutEffect(() => {
    const el = ref.current;
    const box = el?.parentElement;
    if (!el || !box) return;
    const run = () => {
      // The Pours spec badge is always first on this line and a featured tag (migration 030) last; the text
      // between them gets the room that is left.
      const room = (n: HTMLElement | null) => (n ? n.getBoundingClientRect().width + parseFloat(getComputedStyle(n).marginRight || "0") + parseFloat(getComputedStyle(n).marginLeft || "0") : 0);
      const width = box.clientWidth - room(badgeRef.current) - room(tagRef.current);
      if (!box.clientWidth) return;
      fitCanvas ??= document.createElement("canvas");
      const ctx = fitCanvas.getContext("2d");
      if (!ctx) return;
      const cs = getComputedStyle(el);
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      setText(fit.find((t) => ctx.measureText(t).width <= width - 1) ?? fit[fit.length - 1]);
    };
    run();
    const ro = new ResizeObserver(run);
    ro.observe(box);
    ro.observe(el);
    void document.fonts?.ready.then(run);
    return () => ro.disconnect();
  }, [fit, badge, featured, reserved]);
  const place = origin && text.startsWith(origin) ? origin : "";
  return (
    <span ref={ref} className="tv-detail">
      {badge ? <span ref={badgeRef} className="spec-badge">{badge}</span> : null}
      {place ? <span className="tv-origin">{place}</span> : null}
      {place ? text.slice(place.length) : text}
      {featured ? <span ref={tagRef} className="feat-tag tv-feat-tag">Featured</span> : null}
      {reserved ? <span ref={tagRef} className="res-tag tv-res-tag">Ask the host</span> : null}
    </span>
  );
}

/**
 * The row's icon cell: the glass, and under it the guests' average ("4.2 ★", like the phone) on the
 * subtext line. The rating is positioned out of flow, so the cell is exactly as tall as the glass and
 * row heights (and so paging) never change; the cell's fixed width is what the column measurement sees.
 * Unrated: no rating, same width. Hidden only when the subtext lines are hidden.
 */
function Lead({ glass, rating }: { glass: string | null; rating?: number }) {
  return (
    <span className="tv-lead">
      <GlassIcon glass={glass} />
      {rating != null ? (
        <span className="tv-rating" role="img" aria-label={`Rated ${rating.toFixed(1)} of 5`}>
          <span className="tv-rating-num">{rating.toFixed(1)}</span>
          <span className="tv-rating-star" aria-hidden>★</span>
        </span>
      ) : null}
    </span>
  );
}

function Row({ item, rating, on = false }: { item: MenuItem; rating?: number; on?: boolean }) {
  // Pours are grouped by spirit family: the first bottle of a family gets a small gap above it (.fam-start).
  const cls = "tv-row" + (on ? " on" : "") + (item.famStart ? " fam-start" : "") + (item.featured ? " is-featured" : "") + (item.reserved ? " is-reserved" : "");
  // Pours: the spec badge is always on the line under the name. ABV is a superscript on the name.
  // Featured (migration 030): copper name, plus the tag at the end of the line under it ("tag") or a star
  // before the name ("star"); see TV_FEATURED.
  const tag = !!item.featured && TV_FEATURED === "tag";
  const star = !!item.featured && TV_FEATURED === "star";
  // Reserved (migration 032): dimmed, an icon before the name and the "Ask the host" tag under it. Never cast.
  const locked = !!item.reserved;
  const below = !!item.spec || !!item.fit?.length || tag || locked;
  return (
    <li className={cls}>
      <Lead glass={item.glass} rating={rating} />
      <span className="tv-text">
        <span className="tv-name" data-measure={star && item.measure ? `\u2605\u00a0${item.measure}` : locked ? `\u2605\u00a0${item.measure ?? item.name}` : item.measure}>
          {star ? <span className="tv-feat-star" role="img" aria-label="Featured">★</span> : null}
          {locked ? (TV_RESERVED_ICON === "padlock" ? <PadlockIcon className="tv-res-icon" label="Reserved" /> : <KeyIcon className="tv-res-icon" label="Reserved" />) : null}
          {item.name}
          {item.abv ? <sup className="tv-abv">{item.abv}</sup> : null}
        </span>
        {below ? <FitLine fit={item.fit?.length ? item.fit : [""]} badge={item.spec} origin={item.originTv ?? item.origin} featured={tag} reserved={locked} /> : null}
      </span>
    </li>
  );
}

/**
 * TV board. Goal: the whole menu on one screen, full viewport height.
 * 1. Long sections spread across side-by-side sub-columns (within a width budget).
 * 2. Only if it still doesn't fit, ALL columns turn pages together on one slow timer
 *    (a section with fewer pages holds its last page). There is no per-column paging.
 */
export function TvBoard({ columns, ratings = {} }: { columns: Column[]; ratings?: Record<string, number> }) {
  const boardRef = useRef<HTMLDivElement>(null);
  const viewports = useRef<(HTMLDivElement | null)[]>([]);
  const rulers = useRef<(HTMLUListElement | null)[]>([]);
  const [split, setSplit] = useState<number[]>(() => columns.map(() => 1));
  const [assign, setAssign] = useState<number[][]>(() => columns.map((c) => c.items.map(() => 0)));
  const [basis, setBasis] = useState<number[]>(() => columns.map(() => 0));
  const [page, setPage] = useState(0);
  const [visible, setVisible] = useState(true);
  const cast = useCastHighlight();
  // The cast band covers the bottom of the screen. Rows stay full size; whatever no longer fits
  // turns the page with the rest of the board.
  const key = (cast ? "cast|" : "") + columns.map((c) => c.id + ":" + c.items.map((i) => i.id).join(",")).join("|");

  // New data (or the cast band came or went): start over from one sub-column per section.
  useEffect(() => {
    setSplit(columns.map(() => 1));
    // Once more after the band's 400 ms slide, in case mid-animation sizes over-split a section.
    const t = window.setTimeout(() => setSplit(columns.map(() => 1)), 450);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const measure = useCallback(() => {
    const board = boardRef.current;
    if (!board) return;
    const budget = Math.max(columns.length, Math.floor(board.clientWidth / MIN_SUBCOL_PX));
    const packed = columns.map((c, ci) => {
      const box = viewports.current[ci];
      const ruler = rulers.current[ci];
      if (!box || !ruler || box.clientHeight < 40) return c.items.map(() => 0);
      // Featured rows (migration 030) are the first cells of every page (top of its first sub-column), so
      // pack only the rest, with that room reserved on each page (-1 marks a pinned row).
      const heights = rowHeights(ruler);
      const gaps = rowGaps(ruler);
      const keep: number[] = [];
      c.items.forEach((it, i) => { if (!it.featured) keep.push(i); });
      const pinnedH = pinnedHeight(c.items, heights);
      const k = split[ci] ?? 1;
      const subPacked = pack(keep.map((i) => heights[i]), keep.map((i) => gaps[i]), box.getBoundingClientRect().height, (v) => (v % k === 0 ? pinnedH : 0));
      return c.items.map((_, i) => { const at = keep.indexOf(i); return at < 0 ? -1 : subPacked[at]; });
    });
    const needed = packed.map((p) => { const live = p.filter((v) => v >= 0); return live.length ? Math.max(...live) + 1 : 1; });
    const next = allocate(needed, budget);
    // Sub-columns only ever grow while measuring (narrower columns can only need more room),
    // so this settles in a couple of passes.
    if (next.some((n, i) => n > (split[i] ?? 1))) {
      setSplit(next.map((n, i) => Math.max(n, split[i] ?? 1)));
      return;
    }
    // Size each column to its longest name; leftover width is shared evenly.
    const widths = columns.map((_, ci) => {
      const box = viewports.current[ci];
      const ruler = rulers.current[ci];
      return box && ruler ? neededWidth(box.parentElement as HTMLElement, ruler, split[ci] ?? 1) : 0;
    });
    if (widths.some((w, i) => Math.abs(w - (basis[i] ?? 0)) > 1)) {
      setBasis(widths);
      return;
    }
    // Paging rule, for every column: the fewest pages (the greedy packing above), then the rows balanced by
    // count over all the sub-columns on those pages, earlier ones taking the extra row (15 rows on 2 pages =
    // 8/7, on 3 = 5/5/5; 16 in 3 = 6/5/5). Keeps the greedy packing if uneven row heights would overflow.
    const balanced = packed.map((p, ci) => {
      const k = split[ci] ?? 1;
      const box = viewports.current[ci];
      const ruler = rulers.current[ci];
      // Featured rows (migration 030) stay at -1: they are the first cells of every page's first sub-column,
      // and count as rows there, so a page with pinned rows gives its first sub-column fewer paged rows.
      const live = p.map((v, i) => (v < 0 ? -1 : i)).filter((i) => i >= 0);
      const pc = p.length - live.length;
      const pages = Math.ceil(needed[ci] / k);
      const units = live.length + pages * pc;
      const slots = Math.min(units, pages * k);
      if (slots < 2 || !box || !ruler || live.length === 0) return p;
      const base = Math.floor(units / slots);
      const extra = units % slots; // the first `extra` sub-columns take one more row
      const caps = Array.from({ length: slots }, (_, v) => Math.max(0, base + (v < extra ? 1 : 0) - (v % k === 0 ? pc : 0)));
      const even = p.map(() => -1);
      let v = 0;
      for (const i of live) {
        while (v < slots && caps[v] === 0) v++;
        if (v >= slots) return p;
        even[i] = v;
        caps[v]--;
      }
      const heights = rowHeights(ruler);
      const gaps = rowGaps(ruler);
      const pinnedH = pinnedHeight(columns[ci].items, heights);
      // A family gap counts unless its row is first in its sub-column (pinned rows come first on each page).
      const tallest = Math.max(0, ...Array.from({ length: slots }, (_, c) => {
        let sum = c % k === 0 ? pinnedH : 0;
        let first = sum === 0;
        heights.forEach((h, i) => { if (even[i] === c) { sum += h + (first ? 0 : gaps[i]); first = false; } });
        return sum;
      }));
      return tallest <= box.getBoundingClientRect().height ? even : p;
    });
    setAssign(balanced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, split, basis]);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(() => measure());
    if (boardRef.current) ro.observe(boardRef.current);
    // The measuring lists keep resizing while the cast band slides, after the board's own size has settled.
    for (const ruler of rulers.current) if (ruler) ro.observe(ruler);
    // Web fonts change row heights after first paint; measure again once they are ready.
    void document.fonts?.ready.then(() => measure());
    return () => ro.disconnect();
  }, [measure]);

  const needed = assign.map((a) => { const live = a.filter((v) => v >= 0); return live.length ? Math.max(...live) + 1 : 1; });
  const colPages = needed.map((n, i) => Math.ceil(n / (split[i] ?? 1)));
  const pageCount = Math.max(1, ...colPages);

  useEffect(() => {
    if (pageCount <= 1) {
      setPage(0);
      return;
    }
    let fade = 0;
    const id = window.setInterval(() => {
      setVisible(false);
      fade = window.setTimeout(() => {
        setPage((p) => (p + 1) % pageCount);
        setVisible(true);
      }, FADE_MS);
    }, PAGE_MS);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(fade);
    };
  }, [pageCount]);

  const current = page % pageCount;

  return (
    <div className="tv-columns" ref={boardRef} data-pages={pageCount} data-page={current + 1}>
      {columns.map((col, ci) => {
        const n = split[ci] ?? 1;
        const shownPage = Math.min(current, colPages[ci] - 1);
        const subcols = Array.from({ length: n }, (_, k) => shownPage * n + k);
        return (
          <section key={col.id} className="tv-col" data-section={col.id} style={{ flex: `1 1 ${basis[ci] || 0}px` }}>
            <h2 className="tv-heading">{col.label}</h2>
            {/* Only a column that has its own second page says so (all columns turn together; a shorter one holds its last page). */}
            <p className="tv-pageno">{colPages[ci] > 1 ? `${shownPage + 1} / ${colPages[ci]}` : "\u00a0"}</p>
            <div className="tv-viewport" ref={(el) => { viewports.current[ci] = el; }}>
              {/* Invisible full list at sub-column width, used only to measure row heights. */}
              <ul className="tv-list tv-ruler" aria-hidden style={{ width: `${100 / n}%` }} ref={(el) => { rulers.current[ci] = el; }}>
                {col.items.map((item) => <Row key={item.id} item={item} rating={ratings[ratingKey(col.id, item.id)]} />)}
              </ul>
              <div className={`tv-subcols ${visible ? "" : "tv-fading"}`}>
                {subcols.map((v, sc) => (
                  <ul key={v} className="tv-list">
                    {/* Guaranteed slot (migration 030): featured rows are the first cells of every page, in normal flow. */}
                    {sc === 0 ? col.items.map((item) => (item.featured ? <Row key={item.id} item={item} rating={ratings[ratingKey(col.id, item.id)]} on={cast?.id === item.id} /> : null)) : null}
                    {col.items.map((item, i) => (!item.featured && (assign[ci]?.[i] ?? 0) === v ? <Row key={item.id} item={item} rating={ratings[ratingKey(col.id, item.id)]} on={cast?.id === item.id} /> : null))}
                  </ul>
                ))}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
