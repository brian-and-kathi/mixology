"use client";

import { useEffect } from "react";
import { BarSwitchRow, useBar } from "@/components/admin/BarSwitch";
import type { BarState } from "@/components/admin/useBarSwitch";

const TIME = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
const at = (iso: string) => TIME.format(new Date(iso));

/** One plain line under the switch: "Open since 9:14 PM · auto-closes 2:00 AM ET", "Closed at 2:00 AM", or "Closed". */
export function barStatusLine(bar: BarState, now = Date.now()): string {
  if (bar.open) {
    const closes = bar.openUntil ? ` · auto-closes ${at(bar.openUntil)} ET` : "";
    return bar.openedAt ? `Open since ${at(bar.openedAt)}${closes}` : `Open${closes}`;
  }
  // A close from the last day reads as a time; older than that, just "Closed".
  if (bar.closedSince && now - Date.parse(bar.closedSince) < 24 * 3_600_000) return `Closed at ${at(bar.closedSince)}`;
  return "Closed";
}

/** Establishment's first row: the same Open/Closed switch and state as the ☰ menu. */
export function BarCard() {
  const bar = useBar();
  const { reload } = bar;
  useEffect(() => { void reload(); }, [reload]);
  return (
    <section className="a-card a-barcard" aria-label="Open or closed">
      <BarSwitchRow bar={bar} className="a-bar-row-card" />
      <p className="a-barcard-status" aria-live="polite">{barStatusLine(bar)}</p>
    </section>
  );
}
