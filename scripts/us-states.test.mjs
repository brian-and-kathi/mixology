// Unit tests for src/lib/us-states.ts (origin "City, ST" rules). Run: npm run test:origins
// Node 20 can't load .ts directly, so the module is transpiled in memory with the project's TypeScript.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("../src/lib/us-states.ts", import.meta.url), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const m = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);

test("50 states + DC", () => assert.equal(Object.keys(m.US_STATES).length, 51));

test("normalizeOrigin", () => {
  const cases = [
    ["Lake City, Michigan", "Lake City, MI"], ["Lake City Michigan", "Lake City, MI"], ["lake city, MICHIGAN", "lake city, MI"],
    ["Lake City, mi", "Lake City, MI"], ["Lake City, MI", "Lake City, MI"], ["  Lake City ,  Michigan ", "Lake City, MI"],
    ["Traverse City, Michigan", "Traverse City, MI"], ["Brooklyn, New York", "Brooklyn, NY"], ["Brooklyn New York", "Brooklyn, NY"],
    ["Charlotte, north carolina", "Charlotte, NC"], ["Charleston West Virginia", "Charleston, WV"], ["Richmond Virginia", "Richmond, VA"],
    ["Kansas City, Missouri", "Kansas City, MO"], ["Bardstown, Nelson County, Kentucky", "Bardstown, Nelson County, KY"],
    ["Portland, or", "Portland, OR"], ["Washington, District of Columbia", "Washington, DC"], ["Washingtonville, New York", "Washingtonville, NY"],
    // State alone: spelled out.
    ["Kentucky", "Kentucky"], ["kentucky", "Kentucky"], ["New York", "New York"], ["MI", "Michigan"], ["mi", "Michigan"], ["TN", "Tennessee"],
    // Non-US / unknown: untouched.
    ["London", "London"], ["Japan", "Japan"], ["Jalisco, Mexico", "Jalisco, Mexico"], ["Jalisco Mexico", "Jalisco Mexico"],
    ["Islay, Scotland", "Islay, Scotland"], ["Cognac, France", "Cognac, France"], ["Sonoma CA", "Sonoma CA"], ["UK", "UK"],
    ["Lake City, Michigan, USA", "Lake City, Michigan, USA"], ["Michigan City", "Michigan City"], [", Michigan", ", Michigan"],
    ["", ""], [null, null],
  ];
  for (const [input, want] of cases) assert.equal(m.normalizeOrigin(input), want, JSON.stringify(input));
});

test("shortRegion (TV Pours place)", () => {
  const cases = [
    ["Lake City, MI", "Michigan"], ["Bardstown, KY", "Kentucky"], ["Kentucky", "Kentucky"], ["Lake City, Michigan", "Michigan"],
    ["Islay, Scotland", "Scotland"], ["Jalisco, Mexico", "Mexico"], ["Japan", "Japan"], ["Lake City, mi", "mi"], ["Somewhere, XX", "XX"],
    ["Washington, DC", "District of Columbia"], ["", ""], [null, ""],
  ];
  for (const [input, want] of cases) assert.equal(m.shortRegion(input), want, JSON.stringify(input));
});

test("originSearchExtra (/menu search)", () => {
  assert.equal(m.originSearchExtra("Lake City, MI"), "Michigan");
  assert.equal(m.originSearchExtra("Traverse City, MI"), "Michigan");
  assert.equal(m.originSearchExtra("Michigan"), null);
  assert.equal(m.originSearchExtra("Islay, Scotland"), null);
  assert.equal(m.originSearchExtra(null), null);
});

test("spelledOrigin (wine TV card place)", () => {
  const cases = [
    ["Paso Robles, CA", "Paso Robles, California"], ["Paso Robles, California", "Paso Robles, California"],
    ["Washingtonville, NY", "Washingtonville, New York"], ["Washingtonville, New York", "Washingtonville, New York"],
    ["Traverse City, MI", "Traverse City, Michigan"], ["  Fennville ,  MI ", "Fennville, Michigan"],
    ["Bardstown, Nelson County, KY", "Bardstown, Nelson County, Kentucky"], ["MI", "Michigan"], ["California", "California"],
    ["Japan", "Japan"], ["Jalisco, Mexico", "Jalisco, Mexico"], ["Sonoma, ca", "Sonoma, ca"], ["", ""], [null, ""], [undefined, ""],
  ];
  for (const [input, want] of cases) assert.equal(m.spelledOrigin(input), want, JSON.stringify(input));
});
