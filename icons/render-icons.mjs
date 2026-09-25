// Renders the PWA icon PNGs in public/ from the SVG sources in this folder, using headless Chrome.
// One-off tool (not a build step): npm i --no-save playwright-core && node icons/render-icons.mjs icons public
import { chromium } from "playwright-core";
import fs from "fs";
const dir = process.argv[2], out = process.argv[3];
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const jobs = [["icon.svg", "icon-192.png", 192], ["icon.svg", "icon-512.png", 512], ["icon-maskable.svg", "icon-maskable-512.png", 512], ["icon.svg", "apple-touch-icon.png", 180]];
for (const [src, dst, size] of jobs) {
  const p = await b.newPage({ viewport: { width: size, height: size } });
  const svg = fs.readFileSync(`${dir}/${src}`, "utf8").replace('width="512" height="512"', `width="${size}" height="${size}"`);
  await p.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  await p.screenshot({ path: `${out}/${dst}`, omitBackground: true });
  await p.close();
}
await b.close();
