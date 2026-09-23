// After `next build`: fail if any server-only secret VALUE appears in browser assets.
// Prints only variable names and match counts, never values.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
const SECRET_VARS = ["SUPABASE_SERVICE_ROLE_KEY", "EXTRUSION_CORE_API_TOKEN", "EXTRUSION_CORE_API_URL", "TERM_GUARD_KEY", "SUPABASE_DB_URL"];
const root = ".next/static";
if (!existsSync(root)) { console.error("bundle check FAILED: .next/static missing"); process.exit(1); }
const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : files.push(p); } };
walk(root);
const checked = [];
let leaks = 0;
for (const name of SECRET_VARS) {
  const value = process.env[name];
  if (!value || value.length < 8) { checked.push(`${name}: not set in build env (NOT RUN)`); continue; }
  const hits = files.filter((f) => readFileSync(f, "utf8").includes(value)).length;
  leaks += hits;
  checked.push(`${name}: ${hits === 0 ? "0 occurrences" : hits + " FILES CONTAIN VALUE"}`);
}
console.log(`bundle secret scan over ${files.length} files in ${root}:\n  ` + checked.join("\n  "));
if (leaks) { console.error("bundle check FAILED: secret value found in browser assets"); process.exit(1); }
console.log("bundle check PASS (for every variable marked with 0 occurrences)");
