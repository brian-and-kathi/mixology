// Unit tests for src/lib/wine-facts.ts (the Cellar wine TV card facts). Run: npm run test:wine
// Node 20 can't load .ts directly, so the module is transpiled in memory with the project's TypeScript.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("../src/lib/wine-facts.ts", import.meta.url), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const m = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);

test("wineTemp: flags win, then the color group", () => {
  assert.equal(m.wineTemp({ chilled: true, neat: false, styleGroup: "red" }), "Chilled");
  assert.equal(m.wineTemp({ chilled: false, neat: true, styleGroup: "white" }), "Room temperature");
  assert.equal(m.wineTemp({ chilled: true, neat: true, styleGroup: null }), "Chilled or room temperature");
  assert.equal(m.wineTemp({ chilled: false, neat: false, styleGroup: "red" }), "Room temperature");
  assert.equal(m.wineTemp({ chilled: false, neat: false, styleGroup: "white" }), "Chilled");
  assert.equal(m.wineTemp({ chilled: false, neat: false, styleGroup: "rose" }), "Chilled");
  assert.equal(m.wineTemp({ chilled: false, neat: false, styleGroup: "sparkling" }), "Chilled");
  assert.equal(m.wineTemp({ chilled: false, neat: false, styleGroup: "unsorted" }), null);
  assert.equal(m.wineTemp({ chilled: false, neat: false, rocks: true, styleGroup: "unsorted" }), "Over ice");
  assert.equal(m.wineTemp({ chilled: true, neat: false, rocks: true, styleGroup: "white" }), "Chilled or over ice");
});

test("wineColorLabel", () => {
  assert.equal(m.wineColorLabel("red", "still", false), "Red");
  assert.equal(m.wineColorLabel("rose", "not_applicable", false), "Rosé");
  assert.equal(m.wineColorLabel("white", "sparkling", false), "Sparkling white");
  assert.equal(m.wineColorLabel("unknown", "sparkling", false), "Sparkling");
  assert.equal(m.wineColorLabel("red", "still", true), "Fortified red");
  assert.equal(m.wineColorLabel("not_applicable", "not_applicable", false), null);
  assert.equal(m.wineColorLabel(null, null, null), null);
});

test("wineVintage: a year in the name, never guessed", () => {
  const now = new Date("2026-10-06T12:00:00Z");
  assert.equal(m.wineVintage(["Chateau Grand Traverse Merlot 2020"], now), "2020");
  assert.equal(m.wineVintage(["Harvester Cabernet", "Harvester Cabernet Sauvignon Paso Robles 2019"], now), "2019");
  assert.equal(m.wineVintage(["Harvester Cabernet", null], now), null);
  assert.equal(m.wineVintage(["Cuvée 1500 ml"], now), null);
  assert.equal(m.wineVintage(["Reserve 2099"], now), null);
  assert.equal(m.wineVintage(["Bin 20.19"], now), null);
});

test("wineGrapes", () => {
  assert.deepEqual(m.wineGrapes("Merlot"), ["Merlot"]);
  assert.deepEqual(m.wineGrapes("Red blend"), ["Red blend"]);
  assert.deepEqual(m.wineGrapes("Cabernet Sauvignon / Merlot"), ["Cabernet Sauvignon", "Merlot"]);
  assert.deepEqual(m.wineGrapes("Syrah, Grenache and Mourvèdre"), ["Syrah", "Grenache", "Mourvèdre"]);
  assert.deepEqual(m.wineGrapes("  "), []);
  assert.deepEqual(m.wineGrapes(null), []);
});
