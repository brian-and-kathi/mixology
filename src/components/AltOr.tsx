"use client";

import { useState } from "react";

/**
 * The muted "or …" after a recipe line's leading ingredient (migration 034): "or Cognac", "or Cognac, Brandy",
 * or "or Cognac +2" with the rest opening on tap. Same line as the ingredient; never a badge.
 */
export function AltOr({ text, more }: { text: string; more: string[] }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  // Collapsed, "or Cognac +2" stays together: it moves to the next row as one piece rather than strand "+2".
  // The space before it stays outside, so the line can still break before "or".
  return (
    <>
      {" "}
      <span className={more.length && !open ? "alt-or alt-or-keep" : "alt-or"}>
        {text}
        {more.length ? (
          open ? <>, {more.join(", ")}</> : (
            <button type="button" className="alt-more" onClick={() => setOpen(true)} aria-label={`${more.length} more: ${more.join(", ")}`}>
              +{more.length}
            </button>
          )
        ) : null}
      </span>
    </>
  );
}
