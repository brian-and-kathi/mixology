import QRCode from "qrcode";

// TV QR drawn as dots (Vincent, 2026-09-25). The module matrix comes from `qrcode` (already a
// dependency); we draw the SVG ourselves:
// - data (and timing/format) modules are round dots, 85% of a module, centered in their cell;
// - the three finder patterns and any alignment patterns stay solid, with ~20-25% corner radii
//   on their outer ring and inner square, and no dots inside them;
// - error correction Q, since dots cover less area than squares;
// - a full 4-module quiet zone inside the SVG, so nothing next to the code (hash, caption) sits in it.
export const QR_ECL = "Q" as const;
export const QR_QUIET = 4;
const DOT = 0.85;

/** Centers of the alignment patterns for a version (same rule as ISO 18004 / qrcode's own table). */
function alignmentCenters(version: number): [number, number][] {
  if (version === 1) return [];
  const size = version * 4 + 17;
  const count = Math.floor(version / 7) + 2;
  const step = size === 145 ? 26 : Math.ceil((size - 13) / (2 * count - 2)) * 2;
  const coords = [size - 7];
  for (let i = 1; i < count - 1; i++) coords.push(coords[i - 1] - step);
  coords.push(6);
  coords.reverse();
  const out: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    for (let j = 0; j < count; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === count - 1) || (i === count - 1 && j === 0)) continue; // finders
      out.push([coords[i], coords[j]]);
    }
  }
  return out;
}

const n = (v: number) => +v.toFixed(3);

/** Rounded-rectangle subpath (clockwise). */
function rrect(x: number, y: number, w: number, h: number, r: number): string {
  return `M${n(x + r)} ${n(y)}H${n(x + w - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + w)} ${n(y + r)}V${n(y + h - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + w - r)} ${n(y + h)}H${n(x + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x)} ${n(y + h - r)}V${n(y + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + r)} ${n(y)}Z`;
}

/** A solid "eye": a ring of `size` modules (1 module thick) around a centered square of `core` modules. */
function eye(x: number, y: number, size: number, core: number): string {
  const ring = size * 0.22; // outer ring corner radius, ~22% of its size
  const hole = Math.max(ring - 1, 0.1); // keeps the ring an even 1 module thick around the corners
  const c = (size - core) / 2;
  // Ring = outer minus hole (even-odd), then the inner square with ~22% radius.
  return rrect(x, y, size, size, ring) + rrect(x + 1, y + 1, size - 2, size - 2, hole) + rrect(x + c, y + c, core, core, core * 0.22);
}

export type DottedQr = { svg: string; version: number; modules: number; quiet: number; ecl: typeof QR_ECL };

/** SVG markup for `text` as a dotted QR code. `dark` draws the code, `light` fills the square behind it. */
export function dottedQrSvg(text: string, { dark = "#ffffff", light = "#000000" }: { dark?: string; light?: string } = {}): DottedQr {
  const qr = QRCode.create(text, { errorCorrectionLevel: QR_ECL });
  const { size } = qr.modules;
  const q = QR_QUIET;
  const total = size + 2 * q;

  // Areas drawn as solid eyes: 7x7 finders and 5x5 alignment patterns. Nothing else is drawn there.
  const eyes: { r: number; c: number; s: number; core: number }[] = [
    { r: 0, c: 0, s: 7, core: 3 },
    { r: 0, c: size - 7, s: 7, core: 3 },
    { r: size - 7, c: 0, s: 7, core: 3 },
    ...alignmentCenters(qr.version).map(([r, c]) => ({ r: r - 2, c: c - 2, s: 5, core: 1 })),
  ];
  const inEye = (r: number, c: number) => eyes.some((e) => r >= e.r && r < e.r + e.s && c >= e.c && c < e.c + e.s);

  const rad = DOT / 2;
  let dots = "";
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!qr.modules.get(r, c) || inEye(r, c)) continue;
      const cx = c + q + 0.5, cy = r + q + 0.5;
      dots += `M${n(cx - rad)} ${n(cy)}a${rad} ${rad} 0 1 0 ${DOT} 0a${rad} ${rad} 0 1 0 ${-DOT} 0`;
    }
  }
  const solid = eyes.map((e) => eye(e.c + q, e.r + q, e.s, e.core)).join("");

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" data-version="${qr.version}" data-ecl="${QR_ECL}" data-modules="${size}" data-quiet="${q}">` +
    `<rect width="${total}" height="${total}" fill="${light}"/>` +
    `<path fill="${dark}" fill-rule="evenodd" d="${solid}"/>` +
    `<path fill="${dark}" d="${dots}"/>` +
    `</svg>`;
  return { svg, version: qr.version, modules: size, quiet: q, ecl: QR_ECL };
}
