"use client";

import { useId, useState, type ReactNode } from "react";

/** Drawn chevron: points right when closed, turns 90° to point down when open (150 ms; none under reduced motion). */
export function Chevron({ open }: { open: boolean }) {
  return (
    <svg className={open ? "a-disc-chev open" : "a-disc-chev"} viewBox="0 0 16 16" width="16" height="16" aria-hidden focusable="false">
      <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type Props = {
  summary: ReactNode;
  children: ReactNode;
  className?: string;
  headClassName?: string;
  bodyClassName?: string;
  /** Uncontrolled start state (default closed). */
  defaultOpen?: boolean;
  /** Controlled: pass open + onOpenChange. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  id?: string;
};

/**
 * Every collapsible section in admin: the whole header row is one button (aria-expanded,
 * aria-controls) with the chevron on the left and the label right after it. The body stays mounted
 * and is hidden when closed (like <details>), so form fields inside keep their state.
 */
export function Disclosure({ summary, children, className, headClassName, bodyClassName, defaultOpen = false, open, onOpenChange, id }: Props) {
  const [inner, setInner] = useState(defaultOpen);
  const isOpen = open ?? inner;
  const auto = useId();
  const bodyId = id ?? `disc${auto.replace(/:/g, "")}`;
  const toggle = () => {
    if (open === undefined) setInner(!isOpen);
    onOpenChange?.(!isOpen);
  };
  return (
    <div className={["a-disc", className, isOpen ? "is-open" : ""].filter(Boolean).join(" ")}>
      <button type="button" className={["a-disc-head", headClassName].filter(Boolean).join(" ")} aria-expanded={isOpen} aria-controls={bodyId} onClick={toggle}>
        <Chevron open={isOpen} />
        <span className="a-disc-label">{summary}</span>
      </button>
      <div id={bodyId} className={bodyClassName} hidden={!isOpen}>{children}</div>
    </div>
  );
}
