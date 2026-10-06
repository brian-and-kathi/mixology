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

// swapMethod / swapMethodText: the leading alternate's name in the method, only when it's safe.
const L = (own, lead = null, alternates = []) => ({ own, lead, alternates });

test("swapMethod: whole word, case-preserving, possessive kept, plural left alone", () => {
  const lines = [L("bourbon", "cognac", ["cognac"]), L("honey")];
  assert.equal(m.swapMethod("Add the bourbon and lemon.", lines).text, "Add the cognac and lemon.");
  assert.equal(m.swapMethod("Bourbon first, then honey.", lines).text, "Cognac first, then honey.");
  assert.equal(m.swapMethod("BOURBON ONLY", lines).text, "COGNAC ONLY");
  assert.equal(m.swapMethod("The bourbon's warmth.", lines).text, "The cognac's warmth.");
  assert.equal(m.swapMethod("Two bourbons later.", lines).text, "Two bourbons later.");
  assert.equal(m.swapMethod("Bourbonesque, not bourbon.", lines).text, "Bourbonesque, not cognac.");
});

test("swapMethod: multi-word names, and a proper-noun alternate keeps its capitals", () => {
  const lines = [L("ginger ale", "lemon lime soda", ["lemon lime soda"]), L("Pimm's")];
  assert.equal(m.swapMethod("Top with ginger ale, and stir.", lines).text, "Top with lemon lime soda, and stir.");
  assert.equal(m.swapMethod("top with Ginger  Ale", lines).text, "top with Lemon lime soda");
  assert.equal(m.swapMethod("Add the triple sec.", [L("triple sec", "Grand Marnier", ["Grand Marnier"])]).text, "Add the Grand Marnier.");
});

test("swapMethod: skipped when the method already names an alternate (Rachel's 'bourbon or cognac')", () => {
  const lines = [L("bourbon", "cognac", ["cognac", "rye"])];
  const r = m.swapMethod("Add the bourbon or cognac and lemon.", lines);
  assert.equal(r.text, "Add the bourbon or cognac and lemon.");
  assert.deepEqual(r.skipped, [{ from: "bourbon", to: "cognac", why: "names an alternate" }]);
  // Rye leading (bourbon and cognac both out) is skipped too: the text was written for the either-or.
  assert.equal(m.swapMethod("Add the bourbon or cognac.", [L("bourbon", "rye", ["cognac", "rye"])]).text, "Add the bourbon or cognac.");
});

test("swapMethod: skipped when the own name sits inside another line's name ('rum' vs 'spiced rum')", () => {
  const lines = [L("rum", "cachaça", ["cachaça"]), L("spiced rum")];
  const r = m.swapMethod("Add the rum and spiced rum.", lines);
  assert.equal(r.text, "Add the rum and spiced rum.");
  assert.equal(r.skipped[0].why, "inside another name");
  // ...including another line's alternate.
  assert.equal(m.swapMethod("Add the rye.", [L("rye", "bourbon", ["bourbon"]), L("vermouth", null, ["rye vermouth"])]).text, "Add the rye.");
  // But the line's own alternate containing the name is fine: "rum" → "overproof rum".
  assert.equal(m.swapMethod("Warm the rum.", [L("rum", "overproof rum", ["overproof rum"])]).text, "Warm the overproof rum.");
});

test("swapMethod: overlapping names: the shorter is skipped, the longer swaps whole; swaps never chain", () => {
  const both = m.swapMethod("The rum and dark rum.", [L("rum", "cachaça", ["cachaça"]), L("dark rum", "overproof rum", ["overproof rum"])]);
  assert.equal(both.text, "The rum and overproof rum.");
  assert.deepEqual(both.skipped, [{ from: "rum", to: "cachaça", why: "inside another name" }]);
  // a → b and b → c in one pass: "a" becomes "b", not "c".
  const chain = m.swapMethod("Add lemonade and ginger ale.", [L("lemonade", "ginger ale", ["ginger ale"]), L("ginger ale", "soda", ["soda"])]);
  assert.equal(chain.skipped.find((s) => s.from === "lemonade").why, "names an alternate");
  const two = m.swapMethod("Add the apple juice, and lemonade.", [L("apple juice", "apple cider", ["apple cider"]), L("lemonade", "lemon lime soda", ["lemon lime soda"])]);
  assert.equal(two.text, "Add the apple cider, and lemon lime soda.");
});

test("swapMethod: nothing leading, or the name isn't in the text: unchanged", () => {
  assert.equal(m.swapMethod("Add the bourbon.", [L("bourbon", null, ["cognac"])]).text, "Add the bourbon.");
  const r = m.swapMethod("Warm the Grand Marnier and rum.", [L("dark rum", "overproof rum", ["overproof rum"])]);
  assert.equal(r.text, "Warm the Grand Marnier and rum.");
  assert.equal(r.skipped[0].why, "not named");
});

test("swapMethodText: only the method before 'Serves N.'; the house note keeps its bottle names", () => {
  const lines = [L("rye", "bourbon", ["bourbon"])];
  assert.equal(m.swapMethodText("Shake the rye hard. Serves 1. Bowright or Willett rye with a float.", lines),
    "Shake the bourbon hard. Serves 1. Bowright or Willett rye with a float.");
  assert.equal(m.swapMethodText("Shake the rye hard.", lines), "Shake the bourbon hard.");
  assert.equal(m.swapMethodText(null, lines), null);
  assert.equal(m.swapMethodText("Shake the rye. Serves 1.", [L("rye", null, ["bourbon"])]), "Shake the rye. Serves 1.");
});
