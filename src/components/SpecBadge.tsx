"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * A bottle's name with its spec badge right after it ("Bowright Recurve [Rye]"), on Pours (phone and TV).
 * The badge rides with the name's last word in one no-wrap run, so it never starts a line on its own.
 * `off`: the badge is kept in the DOM but hidden (display: none), because useBadgePlace moved it to the
 * subtext line; it stays so the hook can measure the inline case again when the width changes.
 */
export function BadgedName({ name, spec, off = false }: { name: string; spec?: string | null; off?: boolean }) {
  if (!spec) return <>{name}</>;
  const text = name.trim();
  const cut = text.lastIndexOf(" ");
  return (
    <>
      {cut >= 0 ? text.slice(0, cut + 1) : null}
      <span className="badged">
        {text.slice(cut + 1)}
        <span className={off ? "spec-badge is-off" : "spec-badge"}>{spec}</span>
      </span>
    </>
  );
}

/**
 * Where a row's badge goes, decided per row from measured layout (phone cards and TV rows).
 * The badge stays after the name unless showing it there would make the name take more lines than it does
 * alone, or push past the row's edge; then it moves to the start of the subtext line ("[Orange liqueur]
 * France · 40% ABV"). So the badge never splits a name ("Grand / Marnier") and never makes a name that
 * already wraps on its own worse. Measured by showing and hiding the inline badge synchronously inside a
 * layout effect (no paint in between), and again whenever the name's width changes (column changes,
 * resizes) and once web fonts are ready. Rows without a subtext line keep the badge inline.
 */
export function useBadgePlace(spec: string | null | undefined, canMove: boolean) {
  const ref = useRef<HTMLSpanElement>(null);
  const [sub, setSub] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !spec || !canMove) {
      setSub(false);
      return;
    }
    let width = -1;
    const run = () => {
      const badge = el.querySelector<HTMLElement>(".spec-badge");
      if (!badge || !el.clientWidth) return;
      badge.style.display = "inline-block";
      const withBadge = el.getBoundingClientRect().height;
      const over = el.scrollWidth > el.clientWidth + 1;
      badge.style.display = "none";
      const alone = el.getBoundingClientRect().height;
      badge.style.display = "";
      setSub(over || withBadge > alone + 1);
    };
    run();
    const ro = new ResizeObserver(() => {
      if (el.clientWidth !== width) {
        width = el.clientWidth;
        run();
      }
    });
    ro.observe(el);
    void document.fonts?.ready.then(run);
    return () => ro.disconnect();
  }, [spec, canMove]);
  return { ref, sub };
}

/** Phone Pours card text: name (+ badge), then the subtext, which takes the badge when it doesn't fit after the name. */
export function CardText({ name, spec, detail }: { name: string; spec: string | null; detail: ReactNode }) {
  const { ref, sub } = useBadgePlace(spec, detail != null);
  return (
    <span className="item-text">
      <span className="item-name" ref={ref}><BadgedName name={name} spec={spec} off={sub} /></span>
      {detail != null ? (
        <span className="item-detail">
          {sub && spec ? <span className="spec-badge">{spec}</span> : null}
          {detail}
        </span>
      ) : null}
    </span>
  );
}
