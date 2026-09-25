"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

/**
 * Guest phone chrome (DESIGN §5.2): an always-visible frame drawn as fixed overlays over the page's
 * native scroll (no inner scroller, so iOS momentum, the collapsing address bar, pull-to-refresh and
 * scroll restore all keep working), top/bottom fades that appear only when there is content under
 * them, solid edges from a few px inside the frame line out to the screen edge, and the floating
 * menu button. Decorative parts are aria-hidden and ignore pointer events.
 */
export function GuestChrome({ editHref }: { editHref?: string }) {
  const [top, setTop] = useState(false);
  const [bottom, setBottom] = useState(false);

  useEffect(() => {
    let raf = 0;
    const measure = () => {
      raf = 0;
      const doc = document.documentElement;
      const y = window.scrollY;
      setTop(y > 0);
      setBottom(y + window.innerHeight < doc.scrollHeight - 1);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    // Content height can change after fonts load or the page hydrates.
    const ro = new ResizeObserver(onScroll);
    ro.observe(document.body);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <>
      {/* The fades live inside the frame box, so they always meet its inner edge exactly (no separate
          viewport maths that can drift or round differently). The frame paints solid black outside its
          border and a thin solid strip just inside it, so nothing scrolls into view at the edges. */}
      <div aria-hidden className="g-frame">
        <div className={top ? "g-fade g-fade-top on" : "g-fade g-fade-top"} />
        <div className={bottom ? "g-fade g-fade-bottom on" : "g-fade g-fade-bottom"} />
        <div className="g-line">
          <span className="frame-corner tl" />
          <span className="frame-corner tr" />
          <span className="frame-corner bl" />
          <span className="frame-corner br" />
        </div>
      </div>
      <GuestMenu editHref={editHref} />
    </>
  );
}

/** 48px outline hamburger with a small dark dropdown. Disclosure pattern: Escape, outside tap and tabbing away close it. */
function GuestMenu({ editHref }: { editHref?: string }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>("a")?.focus();
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      ref={wrap}
      className="g-menu"
      onBlur={(e) => {
        if (open && e.relatedTarget && !wrap.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        ref={button}
        type="button"
        className="g-menu-btn"
        aria-label="Open menu"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <div ref={panel} id={id} className="g-menu-panel" hidden={!open}>
        <nav aria-label="Site">
          <Link href="/menu" onClick={() => setOpen(false)}>Menu</Link>
          <Link href="/admin/stock" onClick={() => setOpen(false)}>Bar admin</Link>
          {editHref ? (
            <>
              <hr />
              <Link href={editHref} onClick={() => setOpen(false)}>Edit this drink</Link>
            </>
          ) : null}
        </nav>
      </div>
    </div>
  );
}
