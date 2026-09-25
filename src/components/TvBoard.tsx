"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { GlassIcon } from "@/components/GlassIcon";
import type { MenuItem } from "@/lib/menu";

type Column = { id: string; label: string; items: MenuItem[] };

// One slow timer for the whole board. Only used when the menu can't fit on one screen.
const PAGE_MS = 15000;
const FADE_MS = 400;
// Narrowest sub-column we allow before paging instead (keeps names readable across a room).
const MIN_SUBCOL_PX = 420;

/** Assign each row to a "virtual column" so no column is taller than `available` px. */
function pack(heights: number[], available: number): number[] {
  const out: number[] = [];
  let col = 0;
  let used = 0;
  heights.forEach((h, i) => {
    if (used > 0 && used + h > available) {
      col += 1;
      used = 0;
    }
    used += h;
    out[i] = col;
  });
  return out;
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

function Row({ item }: { item: MenuItem }) {
  return (
    <li className="tv-row">
      <GlassIcon glass={item.glass} />
      <span>{item.name}</span>
    </li>
  );
}

/**
 * TV board. Goal: the whole menu on one screen, full viewport height.
 * 1. Long sections spread across side-by-side sub-columns (within a width budget).
 * 2. Only if it still doesn't fit, ALL columns turn pages together on one slow timer
 *    (a section with fewer pages holds its last page). There is no per-column paging.
 */
export function TvBoard({ columns }: { columns: Column[] }) {
  const boardRef = useRef<HTMLDivElement>(null);
  const viewports = useRef<(HTMLDivElement | null)[]>([]);
  const rulers = useRef<(HTMLUListElement | null)[]>([]);
  const [split, setSplit] = useState<number[]>(() => columns.map(() => 1));
  const [assign, setAssign] = useState<number[][]>(() => columns.map((c) => c.items.map(() => 0)));
  const [page, setPage] = useState(0);
  const [visible, setVisible] = useState(true);
  const key = columns.map((c) => c.id + ":" + c.items.map((i) => i.id).join(",")).join("|");

  // New data: start over from one sub-column per section.
  useEffect(() => {
    setSplit(columns.map(() => 1));
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
      const heights = [...ruler.children].map((el) => (el as HTMLElement).offsetHeight);
      return pack(heights, box.clientHeight);
    });
    const needed = packed.map((p) => (p.length ? Math.max(...p) + 1 : 1));
    const next = allocate(needed, budget);
    // Sub-columns only ever grow while measuring (narrower columns can only need more room),
    // so this settles in a couple of passes.
    if (next.some((n, i) => n > (split[i] ?? 1))) {
      setSplit(next.map((n, i) => Math.max(n, split[i] ?? 1)));
      return;
    }
    setAssign(packed);
  }, [columns, split]);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(() => measure());
    if (boardRef.current) ro.observe(boardRef.current);
    // Web fonts change row heights after first paint; measure again once they are ready.
    void document.fonts?.ready.then(() => measure());
    return () => ro.disconnect();
  }, [measure]);

  const needed = assign.map((a) => (a.length ? Math.max(...a) + 1 : 1));
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
          <section key={col.id} className="tv-col" data-section={col.id} style={{ flexGrow: n }}>
            <h2 className="tv-heading">{col.label}</h2>
            <p className="tv-pageno">{pageCount > 1 ? `${current + 1} / ${pageCount}` : "\u00a0"}</p>
            <div className="tv-viewport" ref={(el) => { viewports.current[ci] = el; }}>
              {/* Invisible full list at sub-column width, used only to measure row heights. */}
              <ul className="tv-list tv-ruler" aria-hidden style={{ width: `${100 / n}%` }} ref={(el) => { rulers.current[ci] = el; }}>
                {col.items.map((item) => <Row key={item.id} item={item} />)}
              </ul>
              <div className={`tv-subcols ${visible ? "" : "tv-fading"}`}>
                {subcols.map((v) => (
                  <ul key={v} className="tv-list">
                    {col.items.map((item, i) => ((assign[ci]?.[i] ?? 0) === v ? <Row key={item.id} item={item} /> : null))}
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
