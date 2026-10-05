"use client";

import { MAX_MOODS, MOODS } from "@/lib/moods";

/**
 * Mood tags (migration 033) on the bottle and recipe forms: Brian's 8 moods as toggle chips, up to MAX_MOODS.
 * Once three are on, the rest are disabled until one is turned off. Saved in MOODS order. Guests see them as the
 * phone menu's mood chips (a chip shows once 2 or more items on the menu carry it); the TV ignores them.
 */
export function MoodPicker({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const full = value.length >= MAX_MOODS;
  const toggle = (m: string) => onChange(value.includes(m) ? value.filter((x) => x !== m) : MOODS.filter((x) => x === m || value.includes(x)));
  return (
    <fieldset className="a-fieldset a-moods">
      <legend className="a-label">Moods <span className="a-quiet a-small">(up to {MAX_MOODS})</span></legend>
      <div className="a-chips" role="group" aria-label="Moods">
        {MOODS.map((m) => {
          const on = value.includes(m);
          return (
            <button key={m} type="button" className={on ? "a-chip on" : "a-chip"} aria-pressed={on} disabled={!on && full} onClick={() => toggle(m)}>
              {m}
            </button>
          );
        })}
      </div>
      <span className="a-quiet a-small">
        {value.length ? `${value.join(", ")}. ` : "None yet. "}Guests filter the phone menu by mood; a mood shows once two or more drinks on the menu have it.
      </span>
    </fieldset>
  );
}
