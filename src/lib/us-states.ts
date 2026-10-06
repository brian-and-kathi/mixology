/**
 * US state names and their 2-letter postal codes (50 states + DC), for product origins
 * (Brian via Rachel, 2026-10-04): "City, ST" when there is a city ("Lake City, MI"); a state alone stays
 * spelled out ("Kentucky"). Pure helpers, no imports: used by the TV line, /menu search and admin saves.
 */
export const US_STATES: Readonly<Record<string, string>> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut",
  DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

const lowerName = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
/** Lower-case full name -> code ("new york" -> "NY"). */
const CODE_BY_NAME: Readonly<Record<string, string>> = Object.fromEntries(Object.entries(US_STATES).map(([code, name]) => [lowerName(name), code]));
/** Full names, longest first, so "West Virginia" wins over "Virginia" at the end of "Charleston West Virginia". */
const NAMES_LONGEST_FIRST = Object.values(US_STATES).sort((a, b) => b.length - a.length);

/** The full state name for an exact 2-letter code ("MI" -> "Michigan"); null for anything else (case-sensitive). */
export function stateName(code: string): string | null {
  return Object.prototype.hasOwnProperty.call(US_STATES, code) ? US_STATES[code] : null;
}

/** Last comma segment of an origin, trimmed ("Lake City, MI" -> "MI"; "Kentucky" -> "Kentucky"). */
export function lastSegment(origin: string | null | undefined): string {
  return (origin ?? "").split(",").map((x) => x.trim()).filter(Boolean).pop() ?? "";
}

/**
 * The TV Pours place: the origin's last segment, with an exact US code spelled out ("Lake City, MI" -> "Michigan").
 * Non-US or unknown values come back as they are ("Scotland", "Jalisco, Mexico" -> "Mexico").
 */
export function shortRegion(origin: string | null | undefined): string {
  const last = lastSegment(origin);
  return stateName(last) ?? last;
}

/**
 * The wine TV card's place (Vincent, 2026-10-06): the whole origin, with its last segment spelled out by
 * shortRegion() (the board's Pours helper), so "Paso Robles, CA" -> "Paso Robles, California" and "Lake City, MI"
 * -> "Lake City, Michigan". Spelled-out, non-US and unknown values stay as stored ("Jalisco, Mexico", "Japan").
 * Blank: "".
 */
export function spelledOrigin(origin: string | null | undefined): string {
  const parts = (origin ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (!parts.length) return "";
  return [...parts.slice(0, -1), shortRegion(origin)].join(", ");
}

/** Extra search text for an origin ending in a US code ("Lake City, MI" -> "Michigan"), so "michigan" finds it. Else null. */
export function originSearchExtra(origin: string | null | undefined): string | null {
  const last = lastSegment(origin);
  return stateName(last);
}

/**
 * Admin save normalizer for the Region/Origin field. Light, US-only; anything it doesn't recognize is
 * returned unchanged (apart from the trim the save already does):
 *   "Lake City, Michigan" / "Lake City Michigan" / "lake city, MICHIGAN" -> "Lake City, MI" (city part kept as typed)
 *   "Lake City, mi" -> "Lake City, MI"
 *   "Brooklyn, New York" / "Charleston West Virginia" -> "Brooklyn, NY" / "Charleston, WV" (multi-word names)
 *   "MI" / "mi" (a code alone) -> "Michigan"; "kentucky" (a name alone) -> "Kentucky"
 *   "London", "Japan", "Jalisco, Mexico", "Islay, Scotland" -> unchanged
 * With no comma, only a trailing full state name splits off a city ("Sonoma CA" is left alone).
 */
export function normalizeOrigin(input: string): string;
export function normalizeOrigin(input: string | null): string | null;
export function normalizeOrigin(input: string | null): string | null {
  if (input == null) return input;
  const raw = input.trim();
  if (!raw) return raw;
  const whole = lowerName(raw);
  // A state alone: spelled out, canonical case.
  if (/^[a-z]{2}$/i.test(raw) && stateName(raw.toUpperCase())) return stateName(raw.toUpperCase());
  if (CODE_BY_NAME[whole]) return US_STATES[CODE_BY_NAME[whole]];
  if (raw.includes(",")) {
    const parts = raw.split(",").map((p) => p.trim());
    const last = parts[parts.length - 1];
    const head = parts.slice(0, -1);
    if (!head.length || head.some((p) => !p)) return raw;
    const code = /^[a-z]{2}$/i.test(last) && stateName(last.toUpperCase()) ? last.toUpperCase() : CODE_BY_NAME[lowerName(last)];
    return code ? [...head, code].join(", ") : raw;
  }
  // "City State": a trailing full state name after at least one other word.
  for (const name of NAMES_LONGEST_FIRST) {
    const m = raw.match(new RegExp(`^(.*\\S)\\s+(${name.replace(/ /g, "\\s+")})$`, "i"));
    if (m) return `${m[1]}, ${CODE_BY_NAME[lowerName(name)]}`;
  }
  return raw;
}
