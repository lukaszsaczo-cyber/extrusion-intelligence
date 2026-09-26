import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { STEPS, TRANSITIONS, nextKnowledgeStage, nextStep } from "./steps.ts";

const sql = readFileSync(new URL("../../supabase/migrations/20260926013853_0018_fail_loop.sql", import.meta.url), "utf8");

test("transition table equals the database's (migration 0018)", () => {
  const body = sql.slice(sql.indexOf("if not coalesce((v_last.step"), sql.indexOf("raise exception 'fail_order"));
  const fromSql = [...body.matchAll(/v_last\.step = '([A-Z_]+)'(?: and v_last\.payload ->> 'status' (=|<>) 'DIAGNOSED')? and p_step = '([A-Z_]+)'/g)]
    .map((m) => [m[1], m[3], m[2] === "=" ? "DIAGNOSED" : m[2] === "<>" ? "NOT_DIAGNOSED" : null]);
  assert.deepEqual(fromSql, TRANSITIONS.map((t) => [...t]));
  const enumSql = /create type public\.fail_step as enum \(([^)]+)\)/.exec(sql)![1]!.match(/'([A-Z_]+)'/g)!.map((x) => x.slice(1, -1));
  assert.deepEqual(enumSql, [...STEPS]);
});

test("a diagnosis without a named cause loops back; with one it allows the repair", () => {
  assert.equal(nextStep({ step: "DIAGNOSIS", payload: { status: "INSUFFICIENT_DATA" } }, true), "QUARANTINE");
  assert.equal(nextStep({ step: "DIAGNOSIS", payload: { status: "INCONCLUSIVE" } }, true), "QUARANTINE");
  assert.equal(nextStep({ step: "DIAGNOSIS", payload: { status: "DIAGNOSED" } }, true), "INTERVENTION");
  assert.equal(nextStep({ step: "DIAGNOSIS", payload: {} }, true), null); // no status: nothing offered
  assert.equal(nextStep({ step: "SEPARATION", payload: {} }, false), null); // closed case
});

test("knowledge only after a verified PASS with evidence, in order 38 -> 39 -> 40 -> CROSS", () => {
  const ok = { status: "CLOSED", outcome: "VERIFIED_PASS", outcome_evidence_saved: true };
  assert.equal(nextKnowledgeStage(ok, []), "S38");
  assert.equal(nextKnowledgeStage(ok, ["S38", "S39"]), "S40");
  assert.equal(nextKnowledgeStage(ok, ["S38", "S39", "S40", "CROSS"]), null);
  for (const c of [{ ...ok, outcome: "VERIFIED_FAIL" }, { ...ok, outcome: null }, { ...ok, outcome_evidence_saved: false }, { ...ok, status: "OPEN" }]) {
    assert.equal(nextKnowledgeStage(c, []), null);
  }
});
