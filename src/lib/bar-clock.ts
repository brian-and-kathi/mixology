// When an open bar closes itself: the next 2:00 AM America/New_York (DESIGN §3.1). Pure, no imports, so
// scripts/check-bar-clock.ts can test it directly with an injected clock.

const TZ = "America/New_York";
export const CLOSE_HOUR = 2;

type Wall = { year: number; month: number; day: number; hour: number; minute: number };

function wall(date: Date): Wall {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  const hour = get("hour");
  return { year: get("year"), month: get("month"), day: get("day"), hour: hour === 24 ? 0 : hour, minute: get("minute") };
}

/**
 * The instant the Eastern wall clock first reads `hour`:00 on that calendar date. Eastern is UTC-4 (EDT) or
 * UTC-5 (EST); whichever offset gives that wall time wins. On the spring-forward date 2:00 AM doesn't exist
 * (1:59:59 EST is followed by 3:00 EDT), so the answer is that jump, 07:00 UTC: the first moment it is past 2.
 */
export function easternInstant(year: number, month: number, day: number, hour: number): Date {
  const base = Date.UTC(year, month - 1, day, hour, 0, 0);
  const hits = [4, 5]
    .map((h) => new Date(base + h * 3_600_000))
    .filter((d) => { const w = wall(d); return w.year === year && w.month === month && w.day === day && w.hour === hour && w.minute === 0; })
    .sort((a, b) => a.getTime() - b.getTime());
  return hits[0] ?? new Date(base + 5 * 3_600_000);
}

/** The next 2:00 AM Eastern strictly after `now`. Opening at 12:30 AM closes at 2:00 AM that night; at 2:00 AM or later, the next night. */
export function nextCloseAt(now: Date = new Date()): Date {
  const w = wall(now);
  const today = easternInstant(w.year, w.month, w.day, CLOSE_HOUR);
  if (today.getTime() > now.getTime()) return today;
  // Noon UTC of the next calendar day never lands on a DST edge.
  const next = new Date(Date.UTC(w.year, w.month - 1, w.day + 1, 12));
  return easternInstant(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), CLOSE_HOUR);
}
