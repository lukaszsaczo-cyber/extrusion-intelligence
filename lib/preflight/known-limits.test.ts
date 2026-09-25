import assert from "node:assert/strict";
import { test } from "node:test";
import { checkKnownLimits, type PlanInput } from "./known-limits.ts";

const plan: PlanInput = { feed_kg_h: 100, screw_rpm: 300, water_kg_h: 10, steam_kg_h: null, cutter_rpm: null, zone_setpoints_c: [80, 100, 120] };
const machine = { configured_max_rpm: 400, zone_count: 3 };
const run = (over: Partial<Parameters<typeof checkKnownLimits>[0]> = {}) =>
  checkKnownLimits({ plan, machine, recipeStatus: "FINAL", limits: [], ...over });

test("all known constraints satisfied -> PASS", () => {
  const r = run();
  assert.equal(r.overall, "PASS");
  assert.deepEqual(r.checks.map((c) => [c.id, c.status]), [["RECIPE_FINAL", "PASS"], ["MACHINE_MAX_RPM", "PASS"], ["ZONE_COUNT", "PASS"]]);
});

test("draft recipe -> NEEDS_DATA, never PASS", () => {
  assert.equal(run({ recipeStatus: "DRAFT" }).overall, "NEEDS_DATA");
});

test("rpm above machine maximum -> FAIL", () => {
  const r = run({ plan: { ...plan, screw_rpm: 401 } });
  assert.equal(r.overall, "FAIL");
  assert.equal(r.checks.find((c) => c.id === "MACHINE_MAX_RPM")!.reason, "ABOVE_MAX");
});

test("unknown machine maximum or missing plan rpm -> NEEDS_DATA, not PASS", () => {
  assert.equal(run({ machine: { ...machine, configured_max_rpm: null } }).overall, "NEEDS_DATA");
  assert.equal(run({ plan: { ...plan, screw_rpm: null } }).overall, "NEEDS_DATA");
});

test("zone setpoints must match the machine's zone count", () => {
  assert.equal(run({ plan: { ...plan, zone_setpoints_c: [80, 100] } }).overall, "FAIL");
  assert.equal(run({ machine: { ...machine, zone_count: null } }).overall, "NEEDS_DATA");
  assert.equal(run({ plan: { ...plan, zone_setpoints_c: [] } }).overall, "NEEDS_DATA");
});

test("confirmed limits: MAX, MIN and every zone are checked", () => {
  const limits = [
    { parameter: "feed_kg_h", bound: "MAX" as const, value: 120, unit: "kg/h", source: "CONFIRMED_ON_MACHINE" },
    { parameter: "zone_temperature_c", bound: "MAX" as const, value: 110, unit: "°C", source: "CATALOG" },
  ];
  const r = run({ limits });
  assert.equal(r.overall, "FAIL");
  const zone = r.checks.find((c) => c.parameter === "zone_temperature_c")!;
  assert.deepEqual([zone.status, zone.reason, zone.values], ["FAIL", "ABOVE_MAX", [120]]);
  const minFail = run({ limits: [{ parameter: "water_kg_h", bound: "MIN", value: 15, unit: "kg/h", source: "CATALOG" }] });
  assert.equal(minFail.checks.at(-1)!.reason, "BELOW_MIN");
});

test("a limit in another unit is not converted -> NEEDS_DATA", () => {
  const r = run({ limits: [{ parameter: "feed_kg_h", bound: "MAX", value: 2, unit: "kg/min", source: "CATALOG" }] });
  assert.deepEqual([r.overall, r.checks.at(-1)!.reason], ["NEEDS_DATA", "UNIT_MISMATCH"]);
});

test("a limit on a missing plan value -> NEEDS_DATA", () => {
  const r = run({ limits: [{ parameter: "steam_kg_h", bound: "MAX", value: 5, unit: "kg/h", source: "CATALOG" }] });
  assert.equal(r.overall, "NEEDS_DATA");
});

test("run-time limits (e.g. pressure) are listed, never counted as PASS", () => {
  const r = run({ limits: [{ parameter: "pressure", bound: "MAX", value: 100, unit: "bar", source: "CATALOG" }] });
  assert.equal(r.overall, "PASS");
  assert.equal(r.notCheckableBeforeRun.length, 1);
  assert.equal(r.checks.some((c) => c.parameter === "pressure"), false);
});
