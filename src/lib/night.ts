import { createHmac, timingSafeEqual } from "node:crypto";
import { query } from "@/lib/db";
import { type KnockId, isKnockId, KNOCK_PAD } from "@/lib/night-pad";

/** Spoken-password lists. Short, ordinary words, safe to say at a door. */
const COLORS = ["amber", "black", "blue", "brass", "brown", "copper", "cream", "crimson", "gold", "gray", "green", "indigo", "ivory", "jade", "olive", "pearl", "plum", "red", "rust", "silver", "slate", "violet", "white", "yellow"] as const;
const VERBS = ["borrow", "carry", "catch", "climb", "close", "count", "dance", "drift", "enter", "follow", "gather", "hide", "leave", "listen", "open", "pause", "return", "settle", "signal", "stand", "step", "turn", "wait", "watch"] as const;
const ANIMALS = ["badger", "bear", "crane", "crow", "deer", "dove", "falcon", "fox", "hare", "heron", "horse", "lark", "lynx", "mink", "otter", "owl", "rabbit", "raven", "robin", "sparrow", "stag", "swallow", "swan", "wren"] as const;

const TZ = "America/New_York";
export const LOUNGE_COOKIE = "mx_lounge";

export type Night = {
  day: string;
  /** 0 is the 8:00am code. Each admin roll increments it and retires the previous lounge cookies. */
  generation: number;
  glasses: [KnockId, KnockId, KnockId];
  words: { color: string; verb: string; animal: string };
};

function nightSecret(): string | null {
  const base = process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || process.env.ADMIN_PIN_HASH;
  const trimmed = base?.trim();
  return trimmed ? trimmed : null;
}

/** Calendar date of the speakeasy day. Before 8:00am Eastern it is still yesterday. */
export function speakeasyDay(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  let year = Number(get("year"));
  let month = Number(get("month"));
  let day = Number(get("day"));
  const hour = Number(get("hour"));
  if (!Number.isFinite(hour) || hour < 8 || hour === 24) {
    const prev = new Date(Date.UTC(year, month - 1, day) - 86_400_000);
    year = prev.getUTCFullYear();
    month = prev.getUTCMonth() + 1;
    day = prev.getUTCDate();
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Milliseconds to add to a UTC instant to get its America/New_York wall clock, read as UTC. */
function easternOffset(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  let hour = get("hour");
  if (hour === 24) hour = 0;
  const wall = Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
  return wall - date.getTime();
}

/** A wall-clock time in America/New_York, as an absolute instant. */
function easternWallTime(year: number, month: number, day: number, hour: number): Date {
  const utc = new Date(Date.UTC(year, month - 1, day, hour, 0, 0));
  const offset = easternOffset(utc);
  const first = new Date(utc.getTime() - offset);
  const offset2 = easternOffset(first);
  return offset2 === offset ? first : new Date(utc.getTime() - offset2);
}

/** When tonight's knock and phrase are replaced: 8:00am Eastern the next morning. */
export function loungeExpires(now = new Date()): Date {
  const [year, month, day] = speakeasyDay(now).split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day) + 86_400_000);
  return easternWallTime(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 8);
}

/** Seconds until loungeExpires, at least one so the cookie is stored. */
export function loungeMaxAge(now = new Date()): number {
  return Math.max(1, Math.ceil((loungeExpires(now).getTime() - now.getTime()) / 1000));
}

function missingNightRoll(err: unknown): boolean {
  const e = err as { code?: string; message?: string; cause?: { code?: string } };
  return e?.code === "42P01" || e?.cause?.code === "42P01" || /night_roll/.test(e?.message ?? "") && /does not exist/i.test(e?.message ?? "");
}

/** Admin rolls for this speakeasy day. 0 when nobody has forced a new code, including before the table exists. */
export async function nightGeneration(day: string): Promise<number> {
  try {
    const [row] = await query<{ generation: number | string }>(
      "SELECT generation FROM night_roll WHERE day = $1",
      [day],
    );
    const generation = Number(row?.generation ?? 0);
    return Number.isInteger(generation) && generation >= 0 ? generation : 0;
  } catch (err) {
    if (missingNightRoll(err)) return 0;
    throw err;
  }
}

function digest(day: string, generation: number): Buffer | null {
  const secret = nightSecret();
  if (!secret) return null;
  // Generation 0 keeps the original label so a deploy does not change tonight's code by itself.
  const label = generation === 0 ? `mixology-night-v1:${day}` : `mixology-night-v1:${day}:${generation}`;
  return createHmac("sha256", secret).update(label).digest();
}

function pick(buf: Buffer, offset: number, count: number): number {
  return buf.readUInt16BE(offset) % count;
}

/** Today's knock and spoken password, or null when the server has no signing secret. */
export async function tonight(now = new Date()): Promise<Night | null> {
  const day = speakeasyDay(now);
  const generation = await nightGeneration(day);
  const buf = digest(day, generation);
  if (!buf) return null;
  const glass = (offset: number) => KNOCK_PAD[pick(buf, offset, KNOCK_PAD.length)]!.id;
  return {
    day,
    generation,
    glasses: [glass(0), glass(2), glass(4)],
    words: {
      color: COLORS[pick(buf, 6, COLORS.length)]!,
      verb: VERBS[pick(buf, 8, VERBS.length)]!,
      animal: ANIMALS[pick(buf, 10, ANIMALS.length)]!,
    },
  };
}

/** Replace tonight's code and phrase. Guests holding the previous lounge cookie must knock again. */
export async function rollNight(now = new Date()): Promise<Night> {
  const before = await tonight(now);
  if (!before) throw new Error("no signing secret");
  let latest = before;
  for (let attempt = 0; attempt < 8; attempt++) {
    await query(
      `INSERT INTO night_roll (day, generation) VALUES ($1, 1)
       ON CONFLICT (day) DO UPDATE
         SET generation = night_roll.generation + 1, rolled_at = now()`,
      [before.day],
    );
    const next = await tonight(now);
    if (!next) throw new Error("no signing secret");
    latest = next;
    const sameGlasses = next.glasses.every((id, i) => id === before.glasses[i]);
    const sameWords = next.words.color === before.words.color && next.words.verb === before.words.verb && next.words.animal === before.words.animal;
    if (!sameGlasses || !sameWords) return next;
  }
  return latest;
}

export function knockMatchesNight(given: readonly string[], night: Night | null): boolean {
  if (!night || given.length !== 3 || given.some((id) => !isKnockId(id))) return false;
  let bad = 0;
  for (let i = 0; i < 3; i++) {
    const left = Buffer.alloc(16);
    const right = Buffer.alloc(16);
    Buffer.from(given[i] ?? "").copy(left);
    Buffer.from(night.glasses[i]).copy(right);
    if (!timingSafeEqual(left, right)) bad = 1;
  }
  return bad === 0;
}

function loungeKey(): Buffer | null {
  const secret = nightSecret();
  if (!secret) return null;
  return createHmac("sha256", secret).update("mixology-lounge-v1").digest();
}

export function loungeToken(night: Night): string | null {
  const key = loungeKey();
  if (!key) return null;
  const payload = night.generation === 0 ? `v1.${night.day}` : `v2.${night.day}.${night.generation}`;
  const sig = createHmac("sha256", key).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export async function loungeAllows(token: string | undefined | null, now = new Date()): Promise<boolean> {
  const key = loungeKey();
  if (!key || !token) return false;
  const day = speakeasyDay(now);
  const generation = await nightGeneration(day);
  const parts = token.split(".");
  let payload: string | null = null;
  let sig = "";
  if (generation === 0 && parts.length === 3 && parts[0] === "v1" && parts[1] === day) {
    payload = `v1.${day}`;
    sig = parts[2] ?? "";
  } else if (parts.length === 4 && parts[0] === "v2" && parts[1] === day && parts[2] === String(generation)) {
    payload = `v2.${day}.${generation}`;
    sig = parts[3] ?? "";
  }
  if (!payload) return false;
  const expected = createHmac("sha256", key).update(payload).digest("base64url");
  const left = Buffer.from(expected);
  const right = Buffer.from(sig);
  return left.length === right.length && timingSafeEqual(left, right);
}
