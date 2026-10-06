// Unit tests for src/lib/alternates.ts (migration 034 helpers). Run: npm run test:alternates
// Node 20 can't load .ts directly, so the module is transpiled in memory with the project's TypeScript.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("../src/lib/alternates.ts", import.meta.url), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const m = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);

const alt = (spec_id, extra = {}) => ({ spec_id, amount: null, unit: null, note: null, ...extra });
const stored = (line_spec_id, line_position, spec_id, position, extra = {}) => ({ ...alt(spec_id, extra), line_spec_id, line_position, position });

test("cleanAlternates: no self, no repeats, at most 3, trimmed, amount needs a unit", () => {
  const out = m.cleanAlternates("bourbon", [alt("bourbon"), alt("cognac", { note: "  rounder " }), alt("cognac"), alt("rye"), alt("brandy"), alt("scotch")]);
  assert.deepEqual(out.map((a) => a.spec_id), ["cognac", "rye", "brandy"]);
  assert.equal(out[0].note, "rounder");
  assert.deepEqual(m.cleanAlternates("a", [alt("b", { amount: "", unit: " " })])[0], alt("b"));
  assert.deepEqual(m.cleanAlternates("a", [alt("b", { amount: "0.5", unit: "oz" })])[0], alt("b", { amount: "0.5", unit: "oz" }));
});

test("carryAlternates: follows the ingredient when lines move", () => {
  const old = [{ spec_id: "bourbon", position: 1 }, { spec_id: "honey", position: 2 }];
  const st = [stored("bourbon", 1, "cognac", 1), stored("bourbon", 1, "rye", 2)];
  const out = m.carryAlternates(old, st, [{ spec_id: "honey", position: 1 }, { spec_id: "bourbon", position: 2 }]);
  assert.deepEqual(out[0], []);
  assert.deepEqual(out[1].map((a) => a.spec_id), ["cognac", "rye"]);
});

test("carryAlternates: an ingredient changed in place keeps them, minus the new ingredient", () => {
  const old = [{ spec_id: "bourbon", position: 1 }];
  const out = m.carryAlternates(old, [stored("bourbon", 1, "cognac", 1), stored("bourbon", 1, "rye", 2)], [{ spec_id: "rye", position: 1 }]);
  assert.deepEqual(out[0].map((a) => a.spec_id), ["cognac"]);
});

test("carryAlternates: a deleted line's alternates go with it; a moved-up line doesn't inherit them", () => {
  const old = [{ spec_id: "bourbon", position: 1 }, { spec_id: "honey", position: 2 }];
  const out = m.carryAlternates(old, [stored("bourbon", 1, "cognac", 1)], [{ spec_id: "honey", position: 1 }]);
  assert.deepEqual(out, [[]]);
});

test("carryAlternates: keeps amount, unit and note", () => {
  const old = [{ spec_id: "simple", position: 3 }];
  const out = m.carryAlternates(old, [stored("simple", 3, "rich", 1, { amount: "0.500", unit: "oz", note: "the original" })], [{ spec_id: "simple", position: 3 }]);
  assert.deepEqual(out[0], [alt("rich", { amount: "0.500", unit: "oz", note: "the original" })]);
});

test("orText: one, two, three or more", () => {
  assert.deepEqual(m.orText(["Cognac"]), { text: "or\u00a0Cognac", more: [] });
  assert.deepEqual(m.orText(["Cognac", "Brandy"]), { text: "or\u00a0Cognac, Brandy", more: [] });
  assert.deepEqual(m.orText(["Cognac", "Brandy", "Rye"]), { text: "or\u00a0Cognac", more: ["Brandy", "Rye"] });
  assert.deepEqual(m.orText([]), { text: "", more: [] });
});
