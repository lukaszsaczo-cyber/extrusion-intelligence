// After `next build`: fail if any server-only secret VALUE from the build env
// appears in browser assets. Prints only variable names and counts.
import { describe, listFiles, scan, SECRET_VARS, verdict } from "./lib/secret-scan.mjs";

const root = ".next/static";
const files = listFiles(root);
if (!files) { console.error("bundle check FAILED: .next/static missing"); process.exit(1); }
const results = scan(files, Object.fromEntries(SECRET_VARS.map((n) => [n, process.env[n]])));
console.log(`bundle secret scan over ${files.length} files in ${root}:\n  ${results.map(describe).join("\n  ")}`);
const v = verdict(results);
if (v === "FAIL") { console.error("bundle check FAIL: secret value found in browser assets"); process.exit(1); }
const skipped = results.filter((r) => r.status === "NOT RUN").length;
console.log(v === "PASS"
  ? `bundle check PASS for ${results.length - skipped} variable(s)${skipped ? `, NOT RUN for ${skipped}` : ""}`
  : "bundle check NOT RUN: no secret set in the build env (see npm run test:canary)");
