import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { toDecisionWrite, toVerificationWrite, type PreflightResult } from "./results.ts";

const require = createRequire(import.meta.url);
// The real contract, not a copy.
const S = require("../../server/engine-contract/src/sanitizer.js");
const C = require("../../server/engine-contract/src/contract.js");
const { createGuard } = require("../../server/engine-contract/src/term-guard.js");
const permissive = { isClean: () => true, ready: true };
const migration = (name: string) => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");

test("engine disconnected -> nothing to store (status null is never a decision)", () => {
  assert.equal(toDecisionWrite(S.disconnectedPreflight() as PreflightResult), null);
});

test("sanitized engine answer maps field by field, units from the contract", () => {
  const raw = {
    status: "TEST_REQUIRED", confidenceLabel: "MEDIUM", riskCategories: ["VALIDATION_REQUIRED", "NOT_A_CATEGORY"],
    missingInputs: ["recipe.moisture"], internalScore: 0.93,
    metrics: [{ metric: "pressure", min: 80, max: 95, unit: "psi" }, { metric: "sme", value: 110 }],
    proposedTest: { parameter: "zone_temperature", current: 120, proposed: 125, observationSeconds: 600, zone: 3 },
  };
  const w = toDecisionWrite(S.sanitizePreflight(raw, permissive) as PreflightResult);
  assert.deepEqual(w, {
    status: "TEST_REQUIRED", confidence_label: "MEDIUM", risk_categories: ["VALIDATION_REQUIRED"], missing_inputs: ["recipe.moisture"],
    proposed_test: { parameter: "zone_temperature", current: 120, proposed: 125, unit: "°C", observe_s: 600, zone: 3 },
    predictions: [{ metric: "pressure", kind: "RANGE", min: 80, max: 95, unit: "bar" }, { metric: "sme", kind: "VALUE", value: 110, unit: "Wh/kg" }],
  });
  assert.ok(!JSON.stringify(w).includes("internalScore"));
});

test("term guard not configured: free-text codes are dropped before storing", () => {
  const guard = createGuard({ key: undefined, digests: [] });
  const w = toDecisionWrite(S.sanitizePreflight({ status: "NEEDS_DATA", missingInputs: ["recipe.moisture"] }, guard) as PreflightResult);
  assert.deepEqual(w?.missing_inputs, []);
});

test("verification: evidence only for VERIFIED_PASS with strict true", () => {
  assert.deepEqual(toVerificationWrite(S.sanitizeVerification({ state: "VERIFIED_PASS", evidenceSaved: true })), { state: "VERIFIED_PASS", evidence_saved: true });
  assert.deepEqual(toVerificationWrite(S.sanitizeVerification({ state: "VERIFIED_PASS", evidenceSaved: "true" })), { state: "VERIFIED_PASS", evidence_saved: false });
  assert.deepEqual(toVerificationWrite(S.sanitizeVerification({ state: "VERIFIED_FAIL", evidenceSaved: true })), { state: "VERIFIED_FAIL", evidence_saved: false });
});

test("database validation (0015/0016) uses exactly the contract's units, test parameters and code pattern", () => {
  const sql15 = migration("20260926002721_0015_engine_results.sql");
  const sql16 = migration("20260926003038_0016_engine_results_fail_closed.sql");
  const pairs = (fn: string) => {
    const body = sql15.slice(sql15.indexOf(`function private.${fn}(`), sql15.indexOf("$$;", sql15.indexOf(`function private.${fn}(`)));
    return Object.fromEntries([...body.matchAll(/when '([a-z_]+)' then '([^']+)'/g)].map((m) => [m[1], m[2]]));
  };
  assert.deepEqual(pairs("contract_metric_unit"), { ...C.METRICS });
  assert.deepEqual(pairs("contract_test_unit"), { ...C.TEST_PARAMETERS });
  const codeRe = /const CODE_RE = \/(.+)\/;/.exec(readFileSync(new URL("../../server/engine-contract/src/sanitizer.js", import.meta.url), "utf8"))![1];
  assert.ok(sql16.includes(`c !~ '${codeRe}'`), "missing-input pattern differs from the contract");
});
