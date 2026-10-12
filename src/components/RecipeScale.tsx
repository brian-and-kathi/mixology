"use client";

import { useId, useRef, useState } from "react";
import { AltOr } from "@/components/AltOr";
import { CastButton } from "@/components/CastButton";
import { FeaturedTag } from "@/components/FeaturedTag";
import { RecipePin } from "@/components/RecipePin";
import { altWords } from "@/lib/alt-words";
import { cap, lineText, MAX_SERVINGS, scaleAmount, scaleMethod, scaleProse } from "@/lib/format";

export type ScaleLine = {
  position: number;
  amount: string | null;
  unit: string | null;
  name: string;
  available: boolean;
  required: boolean;
  useInstead: string | null;
  note: string | null;
  parts: { text: string; featured?: boolean; decanting?: boolean }[] | null;
  /** The ingredient name stands in for its one bottle, and that bottle is in a decanter. */
  specDecanting?: boolean;
  alternates: { name: string; amount: string | null; unit: string | null; note: string | null }[];
};

/**
 * Servings for one recipe page. 1 shows the card as written. 2–4 multiply measured lines
 * (not "top" or "rinse"). Show on TV sends the same number, and moving the slider while
 * that cast is up updates the TV without restarting it.
 */
export function RecipeScale({ id, glass, title, lines, methodLabel, method, barOpen }: {
  id: string; glass: string; title: string; lines: ScaleLine[]; methodLabel: string; method: string[];
  /** False while the bar is Closed: Show on TV stays disabled. */
  barOpen: boolean;
}) {
  const [servings, setServings] = useState(1);
  const touched = useRef(false);
  return (
    <>
      <RecipePin glass={glass} title={title}>
        <CastButton
          type="recipe"
          id={id}
          servings={servings}
          barOpen={barOpen}
          onServings={(n) => { if (!touched.current) setServings(n); }}
        />
      </RecipePin>
      <section>
        <h2>Ingredients</h2>
        <Servings value={servings} onChange={(n) => { touched.current = true; setServings(n); }} />
        <ul className="ingredients">
          {lines.map((line) => {
            const view = scaleLine(line, servings);
            const text = lineText(view.amount, view.unit, view.name);
            const or = altWords(view);
            return (
              <li key={line.position}>
                <span className="measure">{text.amount}</span>
                <span className="ingredient">
                  <span className={line.available ? "" : "out"}>{text.name}</span>
                  {or.text ? <AltOr text={or.text} more={or.more} /> : null}
                  {!line.available ? <span className="tag-out">out tonight</span> : null}
                  {line.useInstead ? <strong> (use {cap(line.useInstead)})</strong> : null}
                  {!line.required ? <span className="quiet"> (optional)</span> : null}
                  {line.parts ? (
                    <span className="quiet bottles">
                      {line.parts.map((part, i) => (
                        part.featured
                          ? <span key={i}><span className="feat-name">{part.text}</span><FeaturedTag /></span>
                          : <span key={i}>{part.text}</span>
                      ))}
                    </span>
                  ) : null}
                  {line.note ? <span className="quiet note">{scaleProse(line.note, servings)}</span> : null}
                  {or.notes.map((n, i) => <span key={i} className="quiet note">{scaleProse(n, servings)}</span>)}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
      {method.length > 0 ? (
        <section>
          <h2>{methodLabel}</h2>
          {scaleMethod(method, servings).map((p, i) => (
            <p key={i} className="method">{p}</p>
          ))}
        </section>
      ) : null}
    </>
  );
}

function scaleLine(line: ScaleLine, servings: number): ScaleLine {
  if (servings === 1) return line;
  return {
    ...line,
    amount: scaleAmount(line.amount, line.unit, servings),
    alternates: line.alternates.map((a) => ({ ...a, amount: scaleAmount(a.amount, a.unit, servings) })),
  };
}

function Servings({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const label = useId();
  return (
    <div className="servings">
      <div className="servings-label">
        <span id={label}>Servings</span>
        <b>{value}</b>
      </div>
      <input
        type="range"
        min={1}
        max={MAX_SERVINGS}
        step={1}
        value={value}
        aria-labelledby={label}
        aria-valuemin={1}
        aria-valuemax={MAX_SERVINGS}
        aria-valuenow={value}
        aria-valuetext={value === 1 ? "1 serving" : `${value} servings`}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className="servings-ticks" aria-hidden>
        {Array.from({ length: MAX_SERVINGS }, (_, i) => <span key={i + 1}>{i + 1}</span>)}
      </div>
    </div>
  );
}
