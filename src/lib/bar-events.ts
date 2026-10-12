"use client";

// In-page signal that the bar's Open/Closed status changed (DESIGN §3.1). The 2:00 AM self-close writes
// nothing and publishes nothing, so the screen that notices it (BarWatch on guest pages and the TV,
// useBarSwitch in admin) announces it here, and everything that shows a cast re-reads /api/cast
// (which shows nothing while the bar is Closed). A manual close announces it too.

export const BAR_STATUS_EVENT = "mx:bar-status";
export type BarStatusDetail = { open: boolean };

export function announceBarStatus(open: boolean): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<BarStatusDetail>(BAR_STATUS_EVENT, { detail: { open } }));
}

/** Listen for status changes; returns the unsubscribe. */
export function onBarStatus(fn: (detail: BarStatusDetail) => void): () => void {
  const handler = (e: Event) => fn((e as CustomEvent<BarStatusDetail>).detail);
  window.addEventListener(BAR_STATUS_EVENT, handler);
  return () => window.removeEventListener(BAR_STATUS_EVENT, handler);
}
