import type { ReactNode } from "react";

// Line-art glass shapes (64x64, stroke = currentColor), drawn in the same style as the
// speakeasy app's icons. The 13 glassware names map onto these shapes.
const S = { stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const faint = (o = 0.45) => ({ stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, opacity: o });

const stemAndFoot = (top: number) => (
  <>
    <path {...S} d={`M32 ${top}v${52 - top}`} />
    <path {...S} d="M22 54h20" />
  </>
);

const SHAPES: Record<string, ReactNode> = {
  martini: (
    <>
      <path {...S} d="M14 14h36L32 36 14 14z" />
      {stemAndFoot(36)}
      <circle cx="32" cy="26" r="2.5" fill="currentColor" opacity="0.75" />
    </>
  ),
  coupe: (
    <>
      <path {...S} d="M12 18c0 10 9 16 20 16s20-6 20-16" />
      <path {...S} d="M12 18h40" />
      {stemAndFoot(34)}
      <path {...faint(0.4)} d="M18 24h28" />
    </>
  ),
  nicknora: (
    <>
      <path {...S} d="M20 12c0 10 5 17 12 17s12-7 12-17" />
      <path {...S} d="M20 12h24" />
      {stemAndFoot(29)}
      <path {...faint(0.4)} d="M23 19h18" />
    </>
  ),
  rocks: (
    <>
      <path {...S} d="M16 18h32l-2.5 30a7 7 0 0 1-7 6H25.5a7 7 0 0 1-7-6L16 18z" />
      <rect x="24" y="34" width="9" height="9" rx="1" {...faint(0.7)} fill="none" />
      <rect x="34" y="38" width="8" height="8" rx="1" {...faint(0.55)} fill="none" />
      <ellipse cx="32" cy="18" rx="16" ry="2.2" stroke="currentColor" strokeWidth="2" fill="none" />
    </>
  ),
  doublerocks: (
    <>
      <path {...S} d="M11 14h42l-2.5 34a7 7 0 0 1-7 6H20.5a7 7 0 0 1-7-6L11 14z" />
      <rect x="22" y="30" width="20" height="20" rx="2" {...faint(0.7)} fill="none" />
      <ellipse cx="32" cy="14" rx="21" ry="2.4" stroke="currentColor" strokeWidth="2" fill="none" />
    </>
  ),
  highball: (
    <>
      <path {...S} d="M18 10h28l-3.5 42a6 6 0 0 1-6 5.5H27.5a6 6 0 0 1-6-5.5L18 10z" />
      <path {...faint()} d="M22 22h20M24 34h16" />
      <ellipse cx="32" cy="10" rx="14" ry="2.5" stroke="currentColor" strokeWidth="2" fill="none" />
    </>
  ),
  collins: (
    <>
      <path {...S} d="M21 8h22l-2.5 46a5 5 0 0 1-5 4.5H28.5a5 5 0 0 1-5-4.5L21 8z" />
      <path {...faint(0.4)} d="M24 20h16M25 32h14M26 44h12" />
      <ellipse cx="32" cy="8" rx="11" ry="2" stroke="currentColor" strokeWidth="2" fill="none" />
    </>
  ),
  coppermug: (
    <>
      <path {...S} d="M16 16h28v30a10 10 0 0 1-10 10H26a10 10 0 0 1-10-10V16z" />
      <path {...S} d="M44 22c8 0 12 4 12 10s-4 10-12 10" />
      <path {...faint(0.4)} d="M20 28h20M20 38h20" />
      <ellipse cx="30" cy="16" rx="14" ry="2.5" stroke="currentColor" strokeWidth="2" fill="none" />
    </>
  ),
  wine: (
    <>
      <path {...S} d="M18 12h28" />
      <path {...S} d="M18 12c0 12 6 20 14 22M46 12c0 12-6 20-14 22" />
      {stemAndFoot(34)}
      <path {...faint()} d="M22 24h20" />
    </>
  ),
  flute: (
    <>
      <path {...S} d="M26 8h12" />
      <path {...S} d="M26 8c-1 12 0 22 6 28M38 8c1 12 0 22-6 28" />
      {stemAndFoot(36)}
      <path {...faint()} d="M27 20h10" />
    </>
  ),
  // Ochoko: a low sake cup, as wide as the rocks glass at the rim and on the same baseline,
  // tapering slightly to a narrower base so it reads as a cup.
  ochoko: (
    <>
      <path {...S} d="M16 30h32l-3.2 18.5a6.5 6.5 0 0 1-6.4 5.5H25.6a6.5 6.5 0 0 1-6.4-5.5L16 30z" />
      <path {...faint()} d="M20 39h24" />
      <ellipse cx="32" cy="30" rx="16" ry="2.2" stroke="currentColor" strokeWidth="2" fill="none" />
    </>
  ),
  hurricane: (
    <>
      <path {...S} d="M22 8h20" />
      <path {...S} d="M22 8c-4 8 2 14 0 22-2 8 4 14 10 14M42 8c4 8-2 14 0 22 2 8-4 14-10 14" />
      {stemAndFoot(44)}
    </>
  ),
  irishcoffee: (
    <>
      <path {...S} d="M18 12h24l-2 24a6 6 0 0 1-6 5H26a6 6 0 0 1-6-5L18 12z" />
      <path {...S} d="M41 17c6 0 9 3 9 7.5S47 32 40 32" />
      <path {...S} d="M30 41v11M21 54h18" />
      <ellipse cx="30" cy="12" rx="12" ry="2" stroke="currentColor" strokeWidth="2" fill="none" />
    </>
  ),
  mug: (
    <>
      <path {...S} d="M14 18h30v28a8 8 0 0 1-8 8H22a8 8 0 0 1-8-8V18z" />
      <path {...S} d="M44 24c7 0 11 3.5 11 9s-4 9-11 9" />
      <path {...faint(0.5)} d="M24 10c0 3 2 4 2 7M30 8c0 3 2 5 2 8M36 10c0 3 2 4 2 7" />
      <ellipse cx="29" cy="18" rx="15" ry="2.2" stroke="currentColor" strokeWidth="2" fill="none" />
    </>
  ),
  default: (
    <>
      <path {...S} d="M20 12h24l-3 38a6 6 0 0 1-6 5.5H29a6 6 0 0 1-6-5.5L20 12z" />
      <ellipse cx="32" cy="12" rx="12" ry="2.2" stroke="currentColor" strokeWidth="2" fill="none" />
    </>
  ),
};

// glassware.name -> shape key
const BY_NAME: Record<string, string> = {
  martini: "martini",
  coupe: "coupe",
  "nick & nora": "nicknora",
  rocks: "rocks",
  "double rocks": "doublerocks",
  highball: "highball",
  collins: "collins",
  "copper mug": "coppermug",
  "wine glass": "wine",
  flute: "flute",
  "sake cup": "ochoko",
  hurricane: "hurricane",
  "irish coffee glass": "irishcoffee",
  mug: "mug",
};

// Where each shape's ink ends (viewBox y, before the stroke), for shapes lower than the usual foot at 54.
const FOOT: Record<string, number> = { highball: 57.5, collins: 58.5, coppermug: 56, default: 55.5 };

/** How far (in rem, at the 2.5rem card size) this glass's ink reaches below the usual foot; 0 for most glasses. */
export function glassFootDrop(glass: string | null | undefined): number {
  const key = BY_NAME[(glass ?? "").trim().toLowerCase()] ?? "default";
  return +((((FOOT[key] ?? 54) - 54) / 64) * 2.5).toFixed(4);
}

export function GlassIcon({ glass, className }: { glass: string | null | undefined; className?: string }) {
  const key = BY_NAME[(glass ?? "").trim().toLowerCase()] ?? "default";
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      className={`glass ${className ?? ""}`}
      role="img"
      aria-label={glass ? `Served in a ${glass}` : "Glass"}
    >
      {SHAPES[key]}
    </svg>
  );
}
