// State refresh ("odświeżenie stanu"): after 3/6/28 (separation, quarantine,
// consolidation) rebuild the current picture of a run from CLEAN data only.
// Pure, no I/O. The snapshot is a fact sheet, not a diagnosis: it computes no
// cause and makes no judgement beyond plain arithmetic and explicit comparisons.

import type { Category, QSample, Verdict } from "../quality/rules";

export type LimitRow = { parameter: string; bound: "MIN" | "MAX"; value: number; unit: string };

export type SignalState = {
  tag: string;
  code: string;
  category: Category;
  unit: string | null;
  qualityVerdict: Verdict;
  n: number; // clean samples used
  min: number | null;
  max: number | null;
  mean: number | null;
  median: number | null;
  std: number | null;
  firstTs: string | null;
  lastTs: string | null;
  // Confirmed machine limits for this signal. Compared only when units match
  // exactly; otherwise the comparison is null (not assumed).
  limitMin: number | null;
  limitMax: number | null;
  samplesBelowMin: number | null;
  samplesAboveMax: number | null;
};

export type Snapshot = {
  schema: "state-snapshot/v0";
  runId: string;
  runCode: string;
  machine: {
    id: string;
    screwDiameterMm: number | null;
    lD: number | null;
    drivePowerKw: number | null;
    maxRpm: number | null;
    maxPressureBar: number | null;
    zoneCount: number | null;
  };
  samplingIntervalMs: number | null;
  quality: { assessmentId: string; rulesetVersion: string; verdict: Verdict };
  signals: SignalState[];
  unmappedTags: string[];
  references: { processPlanId: string | null; planPredictions: number; productTargetValues: number };
  totals: { samples: number; cleanSamples: number; quarantinedSamples: number };
};

export type SnapshotInput = {
  run: { id: string; runCode: string; processPlanId: string | null };
  machine: Snapshot["machine"];
  samplingIntervalMs: number | null;
  assessment: { id: string; rulesetVersion: string; verdict: Verdict };
  signalVerdicts: ReadonlyMap<string, Verdict>; // per raw tag, from the assessment
  samples: readonly QSample[];
  quarantinedIds: ReadonlySet<string>;
  tagMap: ReadonlyMap<string, { code: string; category: Category; unit: string | null }>;
  limits: readonly LimitRow[];
  references: { planPredictions: number; productTargetValues: number };
};

const round = (v: number) => Math.round(v * 1e6) / 1e6; // stable JSON/hash across platforms

function stats(values: number[]) {
  if (values.length === 0) return { min: null, max: null, mean: null, median: null, std: null };
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const variance = n > 1 ? sorted.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1) : 0;
  const mid = n >> 1;
  return {
    min: round(sorted[0]!), max: round(sorted[n - 1]!), mean: round(mean),
    median: round(n % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2), std: round(Math.sqrt(variance)),
  };
}

export function buildSnapshot(input: SnapshotInput): Snapshot {
  const byTag = new Map<string, QSample[]>();
  for (const s of input.samples) (byTag.get(s.signal) ?? byTag.set(s.signal, []).get(s.signal)!).push(s);

  const signals: SignalState[] = [];
  const unmappedTags: string[] = [];
  let clean = 0;

  for (const tag of [...byTag.keys()].sort()) {
    const mapped = input.tagMap.get(tag);
    if (!mapped) { unmappedTags.push(tag); continue; }
    const usable = byTag.get(tag)!
      .filter((s) => !input.quarantinedIds.has(s.id) && s.quality === "VALID" && s.value !== null)
      .sort((a, b) => a.tsMs - b.tsMs);
    clean += usable.length;
    const values = usable.map((s) => s.value as number);

    const limit = (bound: "MIN" | "MAX") => {
      const row = input.limits.find((l) => l.parameter === mapped.code && l.bound === bound);
      if (!row) return { value: null, count: null };
      const comparable = mapped.unit !== null && row.unit === mapped.unit;
      const count = comparable ? values.filter((v) => (bound === "MIN" ? v < row.value : v > row.value)).length : null;
      return { value: row.value, count };
    };
    const lo = limit("MIN");
    const hi = limit("MAX");

    signals.push({
      tag, code: mapped.code, category: mapped.category, unit: mapped.unit,
      qualityVerdict: input.signalVerdicts.get(tag) ?? "INSUFFICIENT_DATA",
      n: usable.length, ...stats(values),
      firstTs: usable.length ? new Date(usable[0]!.tsMs).toISOString() : null,
      lastTs: usable.length ? new Date(usable[usable.length - 1]!.tsMs).toISOString() : null,
      limitMin: lo.value, limitMax: hi.value, samplesBelowMin: lo.count, samplesAboveMax: hi.count,
    });
  }

  return {
    schema: "state-snapshot/v0",
    runId: input.run.id,
    runCode: input.run.runCode,
    machine: input.machine,
    samplingIntervalMs: input.samplingIntervalMs,
    quality: { assessmentId: input.assessment.id, rulesetVersion: input.assessment.rulesetVersion, verdict: input.assessment.verdict },
    signals,
    unmappedTags,
    references: { processPlanId: input.run.processPlanId, ...input.references },
    totals: { samples: input.samples.length, cleanSamples: clean, quarantinedSamples: input.quarantinedIds.size },
  };
}

// Canonical JSON (sorted keys, no whitespace) so the same snapshot always hashes the same.
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v !== null && typeof v === "object") {
    return `{${Object.keys(v as object).sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}
