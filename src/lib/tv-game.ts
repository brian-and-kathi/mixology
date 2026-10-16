import { query } from "@/lib/db";

/**
 * TV takeover by a Shindig White Elephant game (migration 041; Brian via Vincent, 2026-10-16). The admin types a
 * Shindig TV token or a URL such as https://shindig.brianandkathi.com/tv/<token>; the TV polls
 * <base>/api/tv/<token>/game and embeds <base>/tv/<token>?embed=1 while a game is live.
 */
export const SHINDIG_BASE = (process.env.SHINDIG_BASE || "https://shindig.brianandkathi.com").replace(/\/+$/, "");
const TOKEN = /^[A-Za-z0-9_-]{4,128}$/;

export type GameTarget = { base: string; token: string };

/** A bare token uses SHINDIG_BASE; a URL keeps its own origin and takes the segment after /tv/ (or the last one). */
export function parseGameSource(source: string | null | undefined): GameTarget | null {
  const s = (source ?? "").trim();
  if (!s) return null;
  if (TOKEN.test(s)) return { base: SHINDIG_BASE, token: s };
  let url: URL;
  try { url = new URL(s); } catch { return null; }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && /^(localhost|127\.0\.0\.1)$/.test(url.hostname))) return null;
  const parts = url.pathname.split("/").filter(Boolean);
  const i = parts.indexOf("tv");
  const token = i >= 0 ? parts[i + 1] : parts[parts.length - 1];
  return token && TOKEN.test(token) ? { base: url.origin, token } : null;
}

export type TvGameRow = { source: string | null; dismissed_at: string | null; changed_at: string };

export async function readTvGame(): Promise<TvGameRow | null> {
  const [row] = await query<TvGameRow>("SELECT source, dismissed_at, changed_at FROM tv_game WHERE id = 1");
  return row ?? null;
}
