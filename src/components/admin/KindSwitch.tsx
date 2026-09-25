"use client";

import { useCallback, useEffect, useState } from "react";

export type Kind = "spirits" | "wines";
const KEY = "mx-admin-kind";
const EVENT = "mx-admin-kind";

/**
 * Spirits | Wines view for Stock and Bottles. Defaults to Spirits; the last choice is remembered on
 * this device (localStorage, shared by both pages). Wines = what the guest Cellar shows (is_cellar_wine).
 */
export function useAdminKind(): [Kind, (k: Kind) => void] {
  const [kind, setKindState] = useState<Kind>("spirits");
  useEffect(() => {
    const read = () => {
      try {
        setKindState(localStorage.getItem(KEY) === "wines" ? "wines" : "spirits");
      } catch {
        /* storage blocked: stay on Spirits */
      }
    };
    read();
    window.addEventListener(EVENT, read);
    return () => window.removeEventListener(EVENT, read);
  }, []);
  const setKind = useCallback((k: Kind) => {
    setKindState(k);
    try {
      localStorage.setItem(KEY, k);
    } catch {
      /* not remembered, still switches */
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [kind, setKind];
}

/** Two-option segmented switch. */
export function KindSwitch({ kind, onChange }: { kind: Kind; onChange: (k: Kind) => void }) {
  return (
    <div className="a-seg" role="group" aria-label="Show">
      {(["spirits", "wines"] as const).map((k) => (
        <button key={k} type="button" aria-pressed={kind === k} className={kind === k ? "on" : undefined} onClick={() => onChange(k)}>
          {k === "spirits" ? "Spirits" : "Wines"}
        </button>
      ))}
    </div>
  );
}
