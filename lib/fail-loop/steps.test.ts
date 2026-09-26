import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { REF_STEPS, STEPS, TRANSITIONS, canClose, nextStep, type LoopState } from "./steps.ts";

const read = (f: string) => readFileSync(new URL(`../../supabase/migrations/${f}`, import.meta.url), "utf8");
const m19 = read("20260926091246_0019_fail_loop_order_a.sql");
const m20 = read("20260926092020_0020_fail_step_state_cast.sql"); // current record_fail_step

test("transition table equals the database's (record_fail_step, migration 0020)", () => {
  const body = m20.slice(m20.indexOf("if not coalesce((v_last.step"), m20.indexOf("raise exception 'fail_order"));
  const fromSql = [...body.matchAll(/v_last\.step = '([A-Z_]+)'(?: and v_diag_status (=|<>) 'DIAGNOSED')?( and v_pass)? and p_step = '([A-Z_]+)'/g)]
    .map((m) => [m[1], m[4], m[2] === "=" ? "DIAGNOSED" : m[2] === "<>" ? "NOT_DIAGNOSED" : m[3] ? "PASS" : null]);
  assert.deepEqual(fromSql, TRANSITIONS.map((t) => [...t]));
});

test("step enum and reference steps equal the database's (migration 0019 / 0020)", () => {
  const enumSql = /create type public\.fail_step as enum \(([\s\S]+?)\);/.exec(m19)![1]!.match(/'([A-Z_]+)'/g)!.map((x) => x.slice(1, -1));
  assert.deepEqual(enumSql, [...STEPS]);
  const refSql = /if p_step not in \(([^)]+)\) and p_ref is not null/.exec(m20)![1]!.match(/'([A-Z_]+)'/g)!.map((x) => x.slice(1, -1));
  assert.deepEqual(refSql, [...REF_STEPS]);
});

const at = (lastStep: string, extra: Partial<LoopState> = {}): LoopState =>
  ({ open: true, lastStep, diagnosisStatus: null, pass: false, ...extra });

test("order A: after ROZPAD I comes the diagnosis, then 3 -> 6 -> 28 -> ODŚWIEŻENIE", () => {
  assert.equal(nextStep(at("DECOMPOSITION")), "DIAGNOSIS");
  assert.equal(nextStep(at("DIAGNOSIS", { diagnosisStatus: "INSUFFICIENT_DATA" })), "EXTRACT");
  assert.equal(nextStep(at("EXTRACT")), "PURGE");
  assert.equal(nextStep(at("PURGE")), "CONSOLIDATE");
  assert.equal(nextStep(at("CONSOLIDATE")), "STATE_REFRESH");
});

test("after ODŚWIEŻENIE: repair only with a named cause, otherwise diagnose again (never a forced cause)", () => {
  assert.equal(nextStep(at("STATE_REFRESH", { diagnosisStatus: "DIAGNOSED" })), "INTERVENTION");
  assert.equal(nextStep(at("STATE_REFRESH", { diagnosisStatus: "INSUFFICIENT_DATA" })), "DIAGNOSIS");
  assert.equal(nextStep(at("STATE_REFRESH", { diagnosisStatus: "INCONCLUSIVE" })), "DIAGNOSIS");
  assert.equal(nextStep(at("STATE_REFRESH")), null); // no diagnosis recorded: nothing offered
});

test("after RAPORT: 38 only for a verified PASS with evidence; then 39 -> 40 -> CROSS -> AUDIT", () => {
  assert.equal(nextStep(at("REPORT", { pass: true })), "FILTER");
  assert.equal(nextStep(at("REPORT", { pass: false })), null);
  assert.equal(nextStep(at("FILTER")), "VERIFY_PERSIST");
  assert.equal(nextStep(at("VERIFY_PERSIST")), "LOCK");
  assert.equal(nextStep(at("LOCK")), "CROSS");
  assert.equal(nextStep(at("CROSS")), "AUDIT");
  assert.equal(nextStep(at("AUDIT")), null);
  assert.equal(nextStep({ ...at("CROSS"), open: false }), null);
});

test("closing with a reason only before VERIFICATION", () => {
  assert.equal(canClose({ status: "OPEN", outcome: null }), true);
  assert.equal(canClose({ status: "OPEN", outcome: "VERIFIED_FAIL" }), false);
  assert.equal(canClose({ status: "CLOSED", outcome: null }), false);
});
