import { createHmac, timingSafeEqual } from "node:crypto";
import { type KnockId, isKnockId, KNOCK_PAD } from "@/lib/night-pad";

/** Spoken-password lists. Short, ordinary words, safe to say at a door. */
const COLORS = ["amber", "black", "blue", "brass", "brown", "copper", "cream", "crimson", "gold", "gray", "green", "indigo", "ivory", "jade", "olive", "pearl", "plum", "red", "rust", "silver", "slate", "violet", "white", "yellow"] as const;
const VERBS = ["borrow", "carry", "catch", "climb", "close", "count", "dance", "drift", "enter", "follow", "gather", "hide", "leave", "listen", "open", "pause", "return", "settle", "signal", "stand", "step", "turn", "wait", "watch"] as const;
const ANIMALS = ["badger", "bear", "crane", "crow", "deer", "dove", "falcon", "fox", "hare", "heron", "horse", "lark", "lynx", "mink", "otter", "owl", "rabbit", "raven", "robin", "sparrow", "stag", "swallow", "swan", "wren"] as const;

const TZ = "America/New_York";
export const LOUNGE_COOKIE = "mx_lounge";

export type Night = {
  day: string;
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

function digest(day: string): Buffer | null {
  const secret = nightSecret();
  if (!secret) return null;
  return createHmac("sha256", secret).update(`mixology-night-v1:${day}`).digest();
}

function pick(buf: Buffer, offset: number, count: number): number {
  return buf.readUInt16BE(offset) % count;
}

/** Today's knock and spoken password, or null when the server has no signing secret. */
export function tonight(now = new Date()): Night | null {
  const day = speakeasyDay(now);
  const buf = digest(day);
  if (!buf) return null;
  const glass = (offset: number) => KNOCK_PAD[pick(buf, offset, KNOCK_PAD.length)]!.id;
  return {
    day,
    glasses: [glass(0), glass(2), glass(4)],
    words: {
      color: COLORS[pick(buf, 6, COLORS.length)]!,
      verb: VERBS[pick(buf, 8, VERBS.length)]!,
      animal: ANIMALS[pick(buf, 10, ANIMALS.length)]!,
    },
  };
}

export function knockMatches(given: readonly string[], now = new Date()): boolean {
  const night = tonight(now);
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

export function loungeToken(day: string): string | null {
  const key = loungeKey();
  if (!key) return null;
  const payload = `v1.${day}`;
  const sig = createHmac("sha256", key).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function loungeAllows(token: string | undefined | null, now = new Date()): boolean {
  const key = loungeKey();
  if (!key || !token) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1" || parts[1] !== speakeasyDay(now)) return false;
  const payload = `v1.${parts[1]}`;
  const expected = createHmac("sha256", key).update(payload).digest("base64url");
  const left = Buffer.from(expected);
  const right = Buffer.from(parts[2] ?? "");
  return left.length === right.length && timingSafeEqual(left, right);
}
