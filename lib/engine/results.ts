// Maps the contract's sanitized results (server/engine-contract sanitizer) to
// the arguments of record_engine_decision / record_engine_verification (0015).
// Field by field, nothing spread; units are the contract's. Pure, no I/O.

type Metric = { metric: string; kind: "VALUE"; value: number; unit: string } | { metric: string; kind: "RANGE"; min: number; max: number; unit: string };
export type PreflightResult = {
  engineConnected: boolean; status: string | null; confidenceLabel: string; predictions: Metric[];
  riskCategories: string[]; missingInputs: string[];
  proposedTest: { parameter: string; current: number; proposed: number; unit: string; observationSeconds: number; zone?: number } | null;
};
export type VerificationResult = { state: string; verifiedEvidenceSaved: boolean };

export type DecisionWrite = {
  status: string; confidence_label: string; risk_categories: string[]; missing_inputs: string[];
  proposed_test: { parameter: string; current: number; proposed: number; unit: string; observe_s: number; zone?: number } | null;
  predictions: ({ metric: string; kind: "VALUE"; value: number; unit: string } | { metric: string; kind: "RANGE"; min: number; max: number; unit: string })[];
};

// null = nothing to store. The contract's disconnected result has status null;
// it is never turned into a decision.
export function toDecisionWrite(r: PreflightResult): DecisionWrite | null {
  if (!r.engineConnected || r.status === null) return null;
  const t = r.proposedTest;
  return {
    status: r.status,
    confidence_label: r.confidenceLabel,
    risk_categories: [...r.riskCategories],
    missing_inputs: [...r.missingInputs],
    proposed_test: t ? {
      parameter: t.parameter, current: t.current, proposed: t.proposed, unit: t.unit, observe_s: t.observationSeconds,
      ...(t.zone !== undefined ? { zone: t.zone } : {}),
    } : null,
    predictions: r.predictions.map((p) => p.kind === "VALUE"
      ? { metric: p.metric, kind: "VALUE" as const, value: p.value, unit: p.unit }
      : { metric: p.metric, kind: "RANGE" as const, min: p.min, max: p.max, unit: p.unit }),
  };
}

export function toVerificationWrite(v: VerificationResult): { state: string; evidence_saved: boolean } {
  return { state: v.state, evidence_saved: v.verifiedEvidenceSaved === true };
}

// Request sent to the engine. The contract defines the engine's answer, not
// this request: "ei-preflight-request-v1" is the app's own format, built only
// from the app's stored public data, and must be agreed with the engine side.
export type PreflightRequestInput = {
  plan: {
    id: string; version: number; feed_kg_h: number | null; screw_rpm: number | null; water_kg_h: number | null;
    steam_kg_h: number | null; cutter_rpm: number | null; zone_setpoints_c: number[];
    screw_configuration: string | null; die: string | null; cutter: string | null;
  };
  machine: {
    id: string; manufacturer: string | null; model: string | null; screw_diameter_mm: number | null; l_d: number | null;
    drive_power_kw: number | null; configured_max_rpm: number | null; configured_max_pressure_bar: number | null; zone_count: number | null;
  } | null;
  recipe: { version_id: string; version: number; status: string; components: { material: string; percent_wet: number }[] } | null;
  targets: { parameter: string; unit: string | null; min: number | null; target: number | null; max: number | null }[];
  limits: { parameter: string; bound: string; value: number; unit: string; source: string }[];
};

export function buildPreflightRequest(i: PreflightRequestInput) {
  return {
    schema: "ei-preflight-request-v1",
    plan: { ...i.plan, zone_setpoints_c: [...i.plan.zone_setpoints_c] },
    machine: i.machine ? { ...i.machine } : null,
    recipe: i.recipe ? { ...i.recipe, components: i.recipe.components.map((c) => ({ material: c.material, percent_wet: c.percent_wet })) } : null,
    targets: i.targets.map((t) => ({ parameter: t.parameter, unit: t.unit, min: t.min, target: t.target, max: t.max })),
    limits: i.limits.map((l) => ({ parameter: l.parameter, bound: l.bound, value: l.value, unit: l.unit, source: l.source })),
  };
}
