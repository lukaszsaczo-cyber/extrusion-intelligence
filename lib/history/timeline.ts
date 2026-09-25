// History: the DECISION -> APPROVAL -> RUN -> ACTUAL -> VERIFICATION chain per
// run and a single event list, built only from stored rows. A step without a
// record is NOT_AVAILABLE; nothing is inferred. Pure, no I/O.

export type RunRow = {
  id: string; run_code: string; status: string; process_plan_id: string | null;
  started_at: string | null; ended_at: string | null; created_at: string; created_by: string | null;
};
export type PlanRow = {
  id: string; preflight_status: string | null; preflight_at: string | null;
  approved_by: string | null; approved_at: string | null; created_at: string; created_by: string | null;
};
export type Stamped = { run_id: string; created_at: string; created_by: string | null };
export type FileRow = Stamped & { filename: string };
export type QualityRow = Stamped & { verdict: string };
export type DiagnosisRow = Stamped & { status: string };
export type MeasurementRow = Stamped & { parameter: string };
export type VerificationRow = Stamped & { kind: string; state: string; verified_at: string };
export type AuditRow = Stamped & { id: string };
export type PredictionRow = { process_plan_id: string; metric: string; created_at: string };

export type StepState = "DONE" | "NOT_AVAILABLE";
export type Step = { state: StepState; at: string | null; label: string | null };
export type Chain = { run: RunRow; decision: Step; approval: Step; run_step: Step; actual: Step; verification: Step };

export type EventKind =
  | "PLAN_CREATED" | "DECISION" | "PREDICTION" | "APPROVAL" | "RUN_CREATED" | "RUN_STARTED" | "RUN_ENDED" | "FILE_IMPORTED"
  | "QUALITY_ASSESSED" | "DIAGNOSIS" | "MEASUREMENT" | "VERIFICATION" | "AUDIT_SEALED";
export type HistoryEvent = { at: string; kind: EventKind; run_id: string | null; by: string | null; label: string | null };

export type HistoryInput = {
  runs: RunRow[]; plans: PlanRow[]; files: FileRow[]; quality: QualityRow[]; diagnoses: DiagnosisRow[];
  measurements: MeasurementRow[]; verifications: VerificationRow[]; audits: AuditRow[]; predictions: PredictionRow[];
};

const NA: Step = { state: "NOT_AVAILABLE", at: null, label: null };
const done = (at: string | null, label: string | null = null): Step => ({ state: "DONE", at, label });
const latest = <T>(rows: T[], at: (r: T) => string): T | undefined =>
  rows.reduce<T | undefined>((best, r) => (best === undefined || at(r) > at(best) ? r : best), undefined);

export function buildChains(input: HistoryInput): Chain[] {
  const plans = new Map(input.plans.map((p) => [p.id, p]));
  const byRun = <T extends { run_id: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) m.set(r.run_id, [...(m.get(r.run_id) ?? []), r]);
    return m;
  };
  const files = byRun(input.files), meas = byRun(input.measurements), vers = byRun(input.verifications);

  return input.runs.map((run) => {
    const plan = run.process_plan_id ? plans.get(run.process_plan_id) : undefined;
    const decision = plan?.preflight_status ? done(plan.preflight_at, plan.preflight_status) : NA;
    const approval = plan?.approved_at ? done(plan.approved_at) : NA;
    const run_step = run.started_at ? done(run.started_at, run.status) : NA;
    const actualRows = [...(files.get(run.id) ?? []), ...(meas.get(run.id) ?? [])];
    const firstActual = actualRows.reduce<string | null>((a, r) => (a === null || r.created_at < a ? r.created_at : a), null);
    const actual = actualRows.length ? done(firstActual, String(actualRows.length)) : NA;
    const v = latest(vers.get(run.id) ?? [], (r) => r.verified_at);
    const verification = v ? done(v.verified_at, v.state) : NA;
    return { run, decision, approval, run_step, actual, verification };
  });
}

export function buildEvents(input: HistoryInput): HistoryEvent[] {
  const runOfPlan = new Map<string, string>();
  for (const r of input.runs) if (r.process_plan_id) runOfPlan.set(r.process_plan_id, r.id);
  const ev: HistoryEvent[] = [];
  for (const p of input.plans) {
    const run_id = runOfPlan.get(p.id) ?? null;
    ev.push({ at: p.created_at, kind: "PLAN_CREATED", run_id, by: p.created_by, label: null });
    // The decision is written by the engine; it has no app user.
    if (p.preflight_status && p.preflight_at) ev.push({ at: p.preflight_at, kind: "DECISION", run_id, by: null, label: p.preflight_status });
    for (const x of input.predictions) {
      // Predictions are written by the engine with the decision; no app user.
      if (x.process_plan_id === p.id) ev.push({ at: x.created_at, kind: "PREDICTION", run_id, by: null, label: x.metric });
    }
    if (p.approved_at) ev.push({ at: p.approved_at, kind: "APPROVAL", run_id, by: p.approved_by, label: null });
  }
  for (const r of input.runs) {
    ev.push({ at: r.created_at, kind: "RUN_CREATED", run_id: r.id, by: r.created_by, label: r.run_code });
    if (r.started_at) ev.push({ at: r.started_at, kind: "RUN_STARTED", run_id: r.id, by: null, label: null });
    if (r.ended_at) ev.push({ at: r.ended_at, kind: "RUN_ENDED", run_id: r.id, by: null, label: r.status });
  }
  const add = <T extends Stamped>(rows: T[], kind: EventKind, label: (r: T) => string | null, at = (r: T) => r.created_at) => {
    for (const r of rows) ev.push({ at: at(r), kind, run_id: r.run_id, by: r.created_by, label: label(r) });
  };
  add(input.files, "FILE_IMPORTED", (r) => r.filename);
  add(input.quality, "QUALITY_ASSESSED", (r) => r.verdict);
  add(input.diagnoses, "DIAGNOSIS", (r) => r.status);
  add(input.measurements, "MEASUREMENT", (r) => r.parameter);
  add(input.verifications, "VERIFICATION", (r) => `${r.kind} ${r.state}`, (r) => r.verified_at);
  add(input.audits, "AUDIT_SEALED", () => null);
  // newest first; equal times keep a fixed order
  return ev.sort((a, b) => (a.at === b.at ? a.kind.localeCompare(b.kind) : a.at < b.at ? 1 : -1));
}
