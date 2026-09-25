// Stage 6 comparisons. Both are app-side views over recorded data; neither
// writes a verification record (that comes from the engine only).

// ---------------------------------------------------------------- predicted vs actual

export type Prediction = { metric: string; kind: "VALUE" | "RANGE"; value: number | null; min: number | null; max: number | null };
export type SnapshotSignal = { code: string; unit: string | null; n: number; min: number | null; max: number | null; median: number | null };
export type Comparison = { status: string; difference: number | null };
// The engine contract's compare() (server/engine-contract), passed in so this
// stays a pure module.
export type CompareFn = (pred: { kind: string; value?: number; min?: number; max?: number } | null, actual: number | null) => Comparison;

export type PvaReason = "NO_SNAPSHOT" | "NO_SIGNAL" | "AMBIGUOUS_SIGNAL" | "UNIT_MISMATCH" | "NO_CLEAN_DATA";
export type PvaRow = {
  metric: string; unit: string; prediction: Prediction;
  actualMedian: number | null; n: number; min: number | null; max: number | null;
  status: string; difference: number | null; reason: PvaReason | null;
};

const unitKey = (u: string | null) => (u ?? "").trim().toLowerCase();

// Actual = median of the clean (non-quarantined) samples in the latest state
// snapshot for the signal whose code equals the metric. Units are never
// converted: a signal in another unit is NOT_AVAILABLE.
export function predictedVsActual(
  predictions: Prediction[], snapshot: SnapshotSignal[] | null,
  metricUnits: Readonly<Record<string, string>>, compare: CompareFn,
): PvaRow[] {
  return predictions.map((p) => {
    const unit = metricUnits[p.metric] ?? "";
    const base = { metric: p.metric, unit, prediction: p, actualMedian: null, n: 0, min: null, max: null, difference: null };
    const na = (reason: PvaReason, extra: Partial<PvaRow> = {}): PvaRow => ({ ...base, status: "NOT_AVAILABLE", reason, ...extra });
    if (!snapshot) return na("NO_SNAPSHOT");
    const matches = snapshot.filter((x) => x.code === p.metric);
    if (matches.length === 0) return na("NO_SIGNAL");
    // Several tags mapped to one signal: picking one would be a guess.
    if (matches.length > 1) return na("AMBIGUOUS_SIGNAL");
    const s = matches[0]!;
    const stats = { n: s.n, min: s.min, max: s.max, actualMedian: s.median };
    if (unitKey(s.unit) !== unitKey(unit)) return na("UNIT_MISMATCH", stats);
    if (s.median === null || s.n === 0) return na("NO_CLEAN_DATA", stats);
    const pred = p.kind === "VALUE" ? { kind: "VALUE", value: p.value ?? undefined } : { kind: "RANGE", min: p.min ?? undefined, max: p.max ?? undefined };
    const c = compare(pred, s.median);
    return { ...base, ...stats, status: c.status, difference: c.difference, reason: null };
  });
}

// ---------------------------------------------------------------- product check vs targets

export type TargetValue = { parameter: string; unit: string | null; min_value: number | null; target_value: number | null; max_value: number | null };
export type Measurement = { parameter: string; value: number; unit: string | null };
export type ProductState = "VERIFIED_PASS" | "VERIFIED_FAIL" | "INCONCLUSIVE" | "INCOMPLETE";
export type ProductReason = "NO_TARGETS" | "NOT_MEASURED" | "UNIT_MISMATCH" | "NO_TOLERANCE" | "OUTSIDE" | null;
export type ProductRow = { parameter: string; state: ProductState; reason: ProductReason; values: number[]; min: number | null; max: number | null; unit: string | null };

// Every target parameter must be measured, in the same unit, and every
// measurement must lie within [min, max]. A target with only a target value and
// no min/max has no tolerance to judge against -> INCONCLUSIVE, never PASS.
export function productCheck(targets: TargetValue[], measurements: Measurement[]): { overall: ProductState; rows: ProductRow[]; reason: ProductReason } {
  if (targets.length === 0) return { overall: "INCOMPLETE", rows: [], reason: "NO_TARGETS" };
  const rows: ProductRow[] = targets.map((t) => {
    const base = { parameter: t.parameter, min: t.min_value, max: t.max_value, unit: t.unit };
    const ms = measurements.filter((m) => m.parameter === t.parameter);
    if (ms.length === 0) return { ...base, state: "INCOMPLETE", reason: "NOT_MEASURED", values: [] };
    const values = ms.map((m) => m.value);
    if (ms.some((m) => unitKey(m.unit) !== unitKey(t.unit))) return { ...base, state: "INCONCLUSIVE", reason: "UNIT_MISMATCH", values };
    if (t.min_value === null && t.max_value === null) return { ...base, state: "INCONCLUSIVE", reason: "NO_TOLERANCE", values };
    const outside = values.filter((v) => (t.min_value !== null && v < t.min_value) || (t.max_value !== null && v > t.max_value));
    return outside.length
      ? { ...base, state: "VERIFIED_FAIL", reason: "OUTSIDE", values: outside }
      : { ...base, state: "VERIFIED_PASS", reason: null, values };
  });
  const any = (s: ProductState) => rows.some((r) => r.state === s);
  const overall: ProductState = any("VERIFIED_FAIL") ? "VERIFIED_FAIL" : any("INCOMPLETE") ? "INCOMPLETE"
    : any("INCONCLUSIVE") ? "INCONCLUSIVE" : "VERIFIED_PASS";
  return { overall, rows, reason: null };
}
