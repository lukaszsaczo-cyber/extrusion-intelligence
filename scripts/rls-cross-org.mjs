// Runs the cross-org RLS test and its negative control against a database.
// Both SQL files roll back everything they create. Needs SUPABASE_DB_URL and
// psql; without them the result is NOT RUN (exit 0, never reported as PASS).
import { execFileSync } from "node:child_process";

const url = process.env.SUPABASE_DB_URL;
const hasPsql = (() => { try { execFileSync("psql", ["--version"], { stdio: "ignore" }); return true; } catch { return false; } })();
if (!url || !hasPsql) {
  console.log(`rls cross-org: NOT RUN (${!url ? "SUPABASE_DB_URL not set" : "psql not installed"})`);
  process.exit(0);
}

function run(file, marker) {
  let out = "";
  try {
    execFileSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-f", file], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    out = String(e.stderr ?? "");
  }
  const m = out.match(new RegExp(`${marker} (\\{.*\\})`));
  if (!m) { console.error(`${file}: did not complete (NOT RUN)\n${out.slice(0, 800)}`); process.exit(1); }
  return JSON.parse(m[1]);
}

const control = run("supabase/tests/rls_negative_control.sql", "RLS_NEGATIVE_CONTROL");
console.log("negative control:", JSON.stringify(control));
if (control.verdict !== "DETECTS_LEAK") { console.error("negative control FAILED: the test cannot detect a leak"); process.exit(1); }

const result = run("supabase/tests/rls_cross_org.sql", "RLS_CROSS_ORG_RESULT");
console.log("rls cross-org:", JSON.stringify(result));
process.exit(result.verdict === "PASS" ? 0 : 1);
