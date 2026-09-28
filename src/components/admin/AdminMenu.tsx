"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { useTvCast } from "@/components/admin/ClearTv";
import { useBarSwitch, type BarState } from "@/components/admin/useBarSwitch";

const ICON = (
  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

/** Header menu on every signed-in admin screen. The bar's Open/Closed switch, guest menu, database, Clear TV, and sign out live here. */
export function AdminMenu({ bar: initialBar }: { bar: BarState }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const tv = useTvCast();
  const bar = useBarSwitch(initialBar, open);

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>("a, button")?.focus();
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
      className="a-menu"
      onBlur={(e) => {
        if (open && e.relatedTarget && !wrap.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        ref={button}
        type="button"
        className="a-menu-btn"
        aria-label="Open menu"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
      >
        {ICON}
      </button>
      <div ref={panel} id={id} className="a-menu-panel" hidden={!open}>
        <nav aria-label="Admin">
          {/* One tap flips the bar (DESIGN §3.1). Closing also takes down whatever is on the TV. */}
          <button type="button" role="switch" aria-checked={bar.open} className="a-bar-row" onClick={() => void bar.toggle()} aria-busy={bar.busy}>
            <span className="a-bar-text">
              <span className="a-bar-label">{bar.open ? "Bar is open" : "Bar is closed"}</span>
              <span className="a-bar-sub">{bar.open ? "Closes itself at 2:00 AM" : "Only admins can get in"}</span>
            </span>
            <span className="a-switch" aria-hidden><i /></span>
          </button>
          {bar.error ? <p className="a-menu-note" role="alert">{bar.error}</p> : null}
          <hr />
          <Link href="/menu" onClick={() => setOpen(false)}>Guest menu</Link>
          <Link href="/db/products" onClick={() => setOpen(false)}>Database</Link>
          <hr />
          <p className="a-menu-status">{tv.live ? `On the TV: ${tv.name}` : "TV is showing the menu"}</p>
          <button type="button" onClick={() => void tv.clear()} disabled={tv.busy || !tv.live}>
            Clear TV
          </button>
          {tv.error ? <p className="a-menu-note">{tv.error}</p> : null}
          <form method="post" action="/api/admin/logout">
            <button type="submit">Sign out</button>
          </form>
        </nav>
      </div>
    </div>
  );
}
