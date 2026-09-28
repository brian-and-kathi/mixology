"use client";

import { createContext, useContext } from "react";
import { useBarSwitch, type BarState } from "@/components/admin/useBarSwitch";

type Bar = ReturnType<typeof useBarSwitch>;
const BarContext = createContext<Bar | null>(null);

/** One Open/Closed state for the whole admin page: the ☰ menu and the Establishment switch both read it. */
export function BarSwitchProvider({ initial, children }: { initial: BarState; children: React.ReactNode }) {
  const bar = useBarSwitch(initial);
  return <BarContext.Provider value={bar}>{children}</BarContext.Provider>;
}

export function useBar(): Bar {
  const bar = useContext(BarContext);
  if (!bar) throw new Error("useBar needs BarSwitchProvider (admin layout).");
  return bar;
}

/** The switch row itself (DESIGN §5.4): one tap flips the bar; closing also takes down whatever is on the TV. */
export function BarSwitchRow({ bar, sub, className }: { bar: Bar; sub?: React.ReactNode; className?: string }) {
  return (
    <>
      <button
        type="button"
        role="switch"
        aria-checked={bar.open}
        className={className ? `a-bar-row ${className}` : "a-bar-row"}
        onClick={() => void bar.toggle()}
        aria-busy={bar.busy}
      >
        <span className="a-bar-text">
          <span className="a-bar-label">{bar.open ? "Bar is open" : "Bar is closed"}</span>
          {sub ? <span className="a-bar-sub">{sub}</span> : null}
        </span>
        <span className="a-switch" aria-hidden><i /></span>
      </button>
      {bar.error ? <p className="a-menu-note" role="alert">{bar.error}</p> : null}
    </>
  );
}
