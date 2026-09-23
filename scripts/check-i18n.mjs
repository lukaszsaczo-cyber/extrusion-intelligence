// Fails the build unless PL and EN have exactly the same non-empty keys.
import { readFileSync } from "node:fs";
const load = (l) => JSON.parse(readFileSync(new URL(`../messages/${l}.json`, import.meta.url), "utf8"));
const flat = (o, p = "") => Object.entries(o).flatMap(([k, v]) =>
  v && typeof v === "object" ? flat(v, p + k + ".") : [[p + k, v]]);
const [pl, en] = [new Map(flat(load("pl"))), new Map(flat(load("en")))];
const problems = [];
for (const [k, v] of pl) { if (!en.has(k)) problems.push(`EN missing: ${k}`); if (typeof v !== "string" || !v.trim()) problems.push(`PL empty: ${k}`); }
for (const [k, v] of en) { if (!pl.has(k)) problems.push(`PL missing: ${k}`); if (typeof v !== "string" || !v.trim()) problems.push(`EN empty: ${k}`); }
if (problems.length) { console.error("i18n check FAILED\n" + problems.join("\n")); process.exit(1); }
console.log(`i18n check PASS: PL ${pl.size} keys, EN ${en.size} keys, 100% parity`);
