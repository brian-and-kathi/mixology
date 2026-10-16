/**
 * While a Shindig game has the TV (TvGame, migration 041) the board's AutoRefresh is held: a menu change is noted
 * and applied once, when the game is over and the board is back (Brian via Vincent, 2026-10-16).
 */
let held = false;
let pending: (() => void) | null = null;

/** Run `refresh` now, or once the hold ends. */
export function refreshUnlessHeld(refresh: () => void) {
  if (held) pending = refresh;
  else refresh();
}

export function setTvHold(on: boolean) {
  held = on;
  if (!on && pending) { const run = pending; pending = null; run(); }
}
