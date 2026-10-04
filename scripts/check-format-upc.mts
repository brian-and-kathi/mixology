// Checks formatUpc() and upcSearchText() (src/lib/format.ts): the printed UPC/EAN format, display only.
// Run: node scripts/check-format-upc.mts  (Node 22.18+ strips the types; older: --experimental-strip-types,
// or on Node 20: npx -y node@22 --experimental-strip-types scripts/check-format-upc.mts)
import { formatUpc, upcSearchText } from "../src/lib/format.ts";

const cases: [string | null, string, string][] = [
  // [stored, printed, what]
  ["012345678905", "0 12345 67890 5", "12 digits: UPC-A"],
  ["0012345678905", "0 12345 67890 5", "13 digits with a leading 0: an EAN-13 that is a UPC-A"],
  ["0857891713726", "8 57891 71372 6", "13 digits with a leading 0 (a real stored code)"],
  ["5012345678900", "5 012345 678900", "13 digits, no leading 0: EAN-13"],
  ["12345670", "1234 5670", "8 digits: UPC-E / EAN-8"],
  ["0 12345 67890 5", "0 12345 67890 5", "already spaced: same printed form"],
  ["00012345678905", "00012345678905", "14 digits (GTIN-14): as is"],
  ["123456789", "123456789", "9 digits: as is"],
  ["", "", "empty: as is"],
  [null, "", "null: empty"],
];

let failed = 0;
for (const [stored, want, what] of cases) {
  const got = formatUpc(stored);
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${what}: ${JSON.stringify(stored)} -> ${JSON.stringify(got)}${ok ? "" : `, want ${JSON.stringify(want)}`}`);
}

// Search text: both the digits and the printed form, so either pasted form is a substring.
const text = upcSearchText("012345678905");
for (const q of ["012345678905", "0 12345 67890 5", "67890"]) {
  const ok = text.includes(q);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} search text ${JSON.stringify(text)} contains ${JSON.stringify(q)}`);
}
const odd = upcSearchText("123456789");
if (odd !== "123456789") { failed++; console.log(`FAIL search text for an unformatted code repeats it: ${JSON.stringify(odd)}`); }
else console.log(`ok   search text for an unformatted code is just the code`);
if (upcSearchText(null) !== "") { failed++; console.log("FAIL search text for no UPC is not empty"); }

console.log(failed ? `${failed} failed` : "all formatUpc checks passed");
process.exit(failed ? 1 : 0);
