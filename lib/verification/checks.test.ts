import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { predictedVsActual, productCheck, type CompareFn } from "./checks.ts";

const require = createRequire(import.meta.url);
// The real contract implementation, not a copy.
const { compare } = require("../../server/engine-contract/src/sanitizer.js") as { compare: CompareFn };
const { METRICS } = require("../../server/engine-contract/src/contract.js") as { METRICS: Record<string, string> };

const snap = [
  { code: "pressure", unit: "bar", n: 50, min: 90, max: 110, median: 100 },
  { code: "melt_temperature", unit: "K", n: 50, min: 400, max: 410, median: 405 },
  { code: "torque", unit: "%", n: 0, min: null, max: null, median: null },
];

test("predicted vs actual uses the contract compare on the clean median", () => {
  const rows = predictedVsActual([
    { metric: "pressure", kind: "RANGE", value: null, min: 95, max: 105 },
    { metric: "pressure", kind: "VALUE", value: 98, min: null, max: null },
    { metric: "pressure", kind: "RANGE", value: null, min: 101, max: 120 },
  ], snap, METRICS, compare);
  assert.deepEqual(rows.map((r) => [r.status, r.difference]), [["WITHIN_RANGE", 0], ["POINT_PREDICTION", 2], ["OUTSIDE_RANGE", -1]]);
});

test("no snapshot, no signal, other unit or no clean data -> NOT_AVAILABLE with a reason", () => {
  const p = (metric: string) => ({ metric, kind: "VALUE" as const, value: 1, min: null, max: null });
  assert.equal(predictedVsActual([p("pressure")], null, METRICS, compare)[0]!.reason, "NO_SNAPSHOT");
  const rows = predictedVsActual([p("sme"), p("melt_temperature"), p("torque")], snap, METRICS, compare);
  assert.deepEqual(rows.map((r) => [r.status, r.reason]), [["NOT_AVAILABLE", "NO_SIGNAL"], ["NOT_AVAILABLE", "UNIT_MISMATCH"], ["NOT_AVAILABLE", "NO_CLEAN_DATA"]]);
});

test("two tags mapped to the same signal -> AMBIGUOUS_SIGNAL, no pick", () => {
  const twice = [...snap, { code: "pressure", unit: "bar", n: 10, min: 1, max: 2, median: 1.5 }];
  const r = predictedVsActual([{ metric: "pressure", kind: "VALUE", value: 1, min: null, max: null }], twice, METRICS, compare);
  assert.deepEqual([r[0]!.status, r[0]!.reason], ["NOT_AVAILABLE", "AMBIGUOUS_SIGNAL"]);
});

const targets = [
  { parameter: "moisture", unit: "%", min_value: 4, target_value: 5, max_value: 6 },
  { parameter: "density", unit: "g/l", min_value: null, target_value: 80, max_value: 100 },
];

test("all measured within tolerance -> VERIFIED_PASS", () => {
  const r = productCheck(targets, [{ parameter: "moisture", value: 5.1, unit: "%" }, { parameter: "density", value: 90, unit: "g/l" }]);
  assert.equal(r.overall, "VERIFIED_PASS");
});

test("missing measurement -> INCOMPLETE, never PASS", () => {
  assert.equal(productCheck(targets, [{ parameter: "moisture", value: 5, unit: "%" }]).overall, "INCOMPLETE");
  assert.deepEqual(productCheck([], []), { overall: "INCOMPLETE", rows: [], reason: "NO_TARGETS" });
});

test("any measurement outside -> VERIFIED_FAIL, even with others missing", () => {
  const r = productCheck(targets, [{ parameter: "moisture", value: 5, unit: "%" }, { parameter: "moisture", value: 6.5, unit: "%" }]);
  assert.equal(r.overall, "VERIFIED_FAIL");
  assert.deepEqual(r.rows[0]!.values, [6.5]);
});

test("other unit or no tolerance -> INCONCLUSIVE", () => {
  assert.equal(productCheck([targets[0]!], [{ parameter: "moisture", value: 0.05, unit: "fraction" }]).overall, "INCONCLUSIVE");
  const noTol = [{ parameter: "hardness", unit: "N", min_value: null, target_value: 20, max_value: null }];
  assert.equal(productCheck(noTol, [{ parameter: "hardness", value: 20, unit: "N" }]).overall, "INCONCLUSIVE");
});
