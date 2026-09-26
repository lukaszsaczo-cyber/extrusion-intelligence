// Runs the database tests against a database: cross-org RLS (with its negative
// control), the stage 5 approval flow, the stage 6 verification guard, the
// stage 7 audit seal and permission matrix, the run/plan guard (0014) and
// the engine results write path (0015/0016) and the FAIL loop (0018).
// Every SQL file rolls back everything it creates. Needs SUPABASE_DB_URL and
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
const approval = run("supabase/tests/approval_flow.sql", "APPROVAL_FLOW_RESULT");
console.log("approval flow:", JSON.stringify(approval));
const verification = run("supabase/tests/verification_guard.sql", "VERIFICATION_GUARD_RESULT");
console.log("verification guard:", JSON.stringify(verification));
const audit = run("supabase/tests/audit_seal.sql", "AUDIT_SEAL_RESULT");
console.log("audit seal:", JSON.stringify(audit));
const matrix = run("supabase/tests/permissions_matrix.sql", "PERMISSIONS_MATRIX_RESULT");
console.log("permissions matrix:", JSON.stringify(matrix));
const runGuard = run("supabase/tests/run_plan_guard.sql", "RUN_PLAN_GUARD_RESULT");
console.log("run/plan guard:", JSON.stringify(runGuard));
const engineResults = run("supabase/tests/engine_results.sql", "ENGINE_RESULTS_RESULT");
console.log("engine results:", JSON.stringify(engineResults));
const failLoop = run("supabase/tests/fail_loop.sql", "FAIL_LOOP_RESULT");
console.log("fail loop:", JSON.stringify(failLoop));
process.exit([result, approval, verification, audit, matrix, runGuard, engineResults, failLoop].every((r) => r.verdict === "PASS") ? 0 : 1);
