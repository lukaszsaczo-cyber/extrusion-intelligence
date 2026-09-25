// Preflight step 1: check a process plan against KNOWN constraints only.
// This is the app's own check, not an engine decision: it never produces an
// approvable status, and PASS only means "no known constraint is violated and
// nothing needed for these checks is missing".

export type CheckStatus = "PASS" | "FAIL" | "NEEDS_DATA";
export type CheckId = "RECIPE_FINAL" | "MACHINE_MAX_RPM" | "ZONE_COUNT" | "LIMIT";
export type Reason =
  | "RECIPE_NOT_FINAL" | "PLAN_VALUE_MISSING" | "MACHINE_VALUE_UNKNOWN" | "UNIT_MISMATCH"
  | "ABOVE_MAX" | "BELOW_MIN" | "ZONE_COUNT_MISMATCH";

export type Check = {
  id: CheckId; status: CheckStatus; reason: Reason | null;
  parameter?: string; limit?: number; unit?: string; source?: string; values?: number[];
};

// Plan inputs that a limit can be checked against before a run, with the only
// unit accepted for each. No unit conversion is attempted.
export const PLAN_PARAMETERS = {
  feed_kg_h: "kg/h",
  screw_rpm: "rpm",
  water_kg_h: "kg/h",
  steam_kg_h: "kg/h",
  cutter_rpm: "rpm",
  zone_temperature_c: "°c",
} as const;
export type PlanParameter = keyof typeof PLAN_PARAMETERS;

export type PlanInput = {
  feed_kg_h: number | null; screw_rpm: number | null; water_kg_h: number | null;
  steam_kg_h: number | null; cutter_rpm: number | null; zone_setpoints_c: number[];
};
export type MachineInput = { configured_max_rpm: number | null; zone_count: number | null };
export type LimitInput = { parameter: string; bound: "MIN" | "MAX"; value: number; unit: string; source: string };

export type KnownLimitsResult = {
  overall: CheckStatus;
  checks: Check[];
  // Limits on quantities that only exist during a run (e.g. pressure): listed,
  // never counted as passed.
  notCheckableBeforeRun: LimitInput[];
};

const unitKey = (u: string) => u.trim().toLowerCase().replace(/\s+/g, "");

function planValues(plan: PlanInput, p: PlanParameter): number[] | null {
  if (p === "zone_temperature_c") return plan.zone_setpoints_c.length ? plan.zone_setpoints_c : null;
  const v = plan[p];
  return v === null ? null : [v];
}

export function checkKnownLimits(input: {
  plan: PlanInput; machine: MachineInput; recipeStatus: string; limits: LimitInput[];
}): KnownLimitsResult {
  const { plan, machine, recipeStatus, limits } = input;
  const checks: Check[] = [];

  checks.push(recipeStatus === "FINAL"
    ? { id: "RECIPE_FINAL", status: "PASS", reason: null }
    : { id: "RECIPE_FINAL", status: "NEEDS_DATA", reason: "RECIPE_NOT_FINAL" });

  if (plan.screw_rpm === null) checks.push({ id: "MACHINE_MAX_RPM", status: "NEEDS_DATA", reason: "PLAN_VALUE_MISSING" });
  else if (machine.configured_max_rpm === null) checks.push({ id: "MACHINE_MAX_RPM", status: "NEEDS_DATA", reason: "MACHINE_VALUE_UNKNOWN" });
  else checks.push({
    id: "MACHINE_MAX_RPM", status: plan.screw_rpm > machine.configured_max_rpm ? "FAIL" : "PASS",
    reason: plan.screw_rpm > machine.configured_max_rpm ? "ABOVE_MAX" : null,
    limit: machine.configured_max_rpm, unit: "rpm", values: [plan.screw_rpm],
  });

  if (machine.zone_count === null) checks.push({ id: "ZONE_COUNT", status: "NEEDS_DATA", reason: "MACHINE_VALUE_UNKNOWN" });
  else if (plan.zone_setpoints_c.length === 0) checks.push({ id: "ZONE_COUNT", status: "NEEDS_DATA", reason: "PLAN_VALUE_MISSING" });
  else checks.push({
    id: "ZONE_COUNT", status: plan.zone_setpoints_c.length === machine.zone_count ? "PASS" : "FAIL",
    reason: plan.zone_setpoints_c.length === machine.zone_count ? null : "ZONE_COUNT_MISMATCH",
    limit: machine.zone_count, values: [plan.zone_setpoints_c.length],
  });

  const notCheckableBeforeRun: LimitInput[] = [];
  for (const l of limits) {
    if (!(l.parameter in PLAN_PARAMETERS)) { notCheckableBeforeRun.push(l); continue; }
    const p = l.parameter as PlanParameter;
    const base = { id: "LIMIT" as const, parameter: p, limit: l.value, unit: l.unit, source: l.source };
    const values = planValues(plan, p);
    if (values === null) { checks.push({ ...base, status: "NEEDS_DATA", reason: "PLAN_VALUE_MISSING" }); continue; }
    if (unitKey(l.unit) !== PLAN_PARAMETERS[p]) { checks.push({ ...base, status: "NEEDS_DATA", reason: "UNIT_MISMATCH", values }); continue; }
    const bad = values.filter((v) => (l.bound === "MAX" ? v > l.value : v < l.value));
    checks.push(bad.length
      ? { ...base, status: "FAIL", reason: l.bound === "MAX" ? "ABOVE_MAX" : "BELOW_MIN", values: bad }
      : { ...base, status: "PASS", reason: null, values });
  }

  const overall: CheckStatus = checks.some((c) => c.status === "FAIL") ? "FAIL"
    : checks.some((c) => c.status === "NEEDS_DATA") ? "NEEDS_DATA" : "PASS";
  return { overall, checks, notCheckableBeforeRun };
}
