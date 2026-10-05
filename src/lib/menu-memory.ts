/**
 * /menu remembers its search, filters, tab and scroll for the visit (Brian via Vincent, 2026-10-04): one
 * sessionStorage entry per browser tab, so opening a drink and coming back (browser back or any in-app link to
 * /menu) restores it, while a new tab or session starts fresh. Client only; every read is validated and any
 * storage error (private mode, quota) just means nothing is remembered. No history entries are added.
 */
import type { SectionId } from "@/lib/menu";
import type { SectionPick } from "@/lib/menu-filter";

export const MENU_MEMORY_KEY = "menu-state-v1";

export type MenuMemory = {
  tab: "all" | SectionId;
  q: string;
  mood: string | null;
  picks: Record<SectionId, SectionPick>;
  /** window.scrollY when last seen. */
  y: number;
};

const str = (v: unknown, max = 60): string | null => (typeof v === "string" && v.length <= max ? v : null);
// A grape only goes with a color: a saved grape with no color is dropped. Older builds saved "nothing chosen" as null
// too; any other value that isn't a chip on tonight's menu (e.g. "all") is dropped by validPicks() in MenuBrowser.
const pick = (v: unknown): SectionPick => {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const chip = str(o.chip);
  return { chip, grape: chip ? str(o.grape) : null };
};

/**
 * The saved state, or null when there is none (or it can't be read). Unknown tabs fall back to "all". A "top"
 * (Top rated) value saved by an older build is ignored: that filter is gone (Brian via Vincent, 2026-10-04), and
 * the restore writes the state back without it.
 */
export function readMenuMemory(tabs: readonly string[]): MenuMemory | null {
  try {
    const raw = window.sessionStorage.getItem(MENU_MEMORY_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (!o || typeof o !== "object") return null;
    const tab = typeof o.tab === "string" && tabs.includes(o.tab) ? (o.tab as MenuMemory["tab"]) : "all";
    const p = (o.picks && typeof o.picks === "object" ? o.picks : {}) as Record<string, unknown>;
    const y = typeof o.y === "number" && Number.isFinite(o.y) && o.y > 0 ? Math.round(o.y) : 0;
    return { tab, q: str(o.q) ?? "", mood: str(o.mood), picks: { pours: pick(p.pours), cocktails: pick(p.cocktails), cellar: pick(p.cellar) }, y };
  } catch {
    return null;
  }
}

/** Save the state; the default state at the top of the page removes the entry instead. */
export function writeMenuMemory(m: MenuMemory): void {
  try {
    const plain = m.tab === "all" && !m.q && !m.mood && m.y <= 0 && Object.values(m.picks).every((x) => !x.chip && !x.grape);
    if (plain) window.sessionStorage.removeItem(MENU_MEMORY_KEY);
    else window.sessionStorage.setItem(MENU_MEMORY_KEY, JSON.stringify(m));
  } catch {
    // Storage unavailable or full: nothing is remembered.
  }
}

/**
 * Inline script for the server-rendered page: on a full page load with something saved, the browse area stays
 * hidden until MenuBrowser has put the saved state back (it removes the attribute), so the unfiltered list never
 * flashes. A 2 s fallback shows it anyway if the script bundle never runs.
 */
export const MENU_RESTORE_GUARD = `try{if(sessionStorage.getItem(${JSON.stringify(MENU_MEMORY_KEY)})){var d=document.documentElement;d.setAttribute("data-menu-restore","");setTimeout(function(){d.removeAttribute("data-menu-restore")},2000)}}catch(e){}`;
