"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { GlassIcon } from "@/components/GlassIcon";

/**
 * Phone recipe page: the "Show on TV" row stays pinned below the menu-button row while a long recipe
 * scrolls, and once pinned shows a small glass and the drink name beside a compact button, so the pinned
 * strip reads glass · title · Show on TV.
 *
 * Only this row is sticky (CSS position: sticky). Its height is the same pinned or not, so pinning never
 * changes layout: no scroll jump, no scroll-anchoring loop, and no jitter at the threshold. A zero-height
 * sentinel just above it decides "pinned" (it has passed the row's sticky top); the observer only toggles a
 * class, and the compaction (fade in the glass/title, narrow the button) is CSS.
 *
 * There is still one CastButton (passed as children): it tracks this tab's cast and takes it off the TV
 * when the page closes, so it must not be duplicated. The small title is aria-hidden; the page's h1 is the
 * heading.
 */
export function RecipePin({ glass, title, children }: { glass: string; title: string; children: ReactNode }) {
  const bar = useRef<HTMLDivElement>(null);
  const mark = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = bar.current;
    const sentinel = mark.current;
    if (!el || !sentinel || typeof IntersectionObserver === "undefined") return;
    let io: IntersectionObserver | null = null;
    const watch = () => {
      io?.disconnect();
      // The pin line is the row's own sticky top (frame inset + menu-button row), read from CSS so it
      // tracks safe areas. The sentinel is "pinned" once it is above that line.
      const top = parseFloat(getComputedStyle(el).top) || 0;
      io = new IntersectionObserver(
        ([e]) => el.classList.toggle("pinned", !e.isIntersecting && e.boundingClientRect.top < top + 1),
        { rootMargin: `${-Math.round(top)}px 0px 0px 0px`, threshold: 0 },
      );
      io.observe(sentinel);
    };
    watch();
    window.addEventListener("resize", watch);
    return () => {
      io?.disconnect();
      window.removeEventListener("resize", watch);
    };
  }, []);

  return (
    <>
      <div ref={mark} className="r-pin-mark" aria-hidden />
      <div ref={bar} className="r-pin">
        <div className="r-pin-id" aria-hidden>
          <GlassIcon glass={glass} className="r-pin-glass" />
          <span className="r-pin-title">{title}</span>
        </div>
        {children}
      </div>
    </>
  );
}
