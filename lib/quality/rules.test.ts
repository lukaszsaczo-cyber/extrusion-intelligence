import test from "node:test";
import assert from "node:assert/strict";
import { assess, RULESET_V0, type QSample, type Ruleset, type TagInfo } from "./rules.ts";

const T0 = Date.parse("2026-09-25T08:00:00Z");
const tags = new Map<string, TagInfo>([
  ["P1", { code: "pressure", category: "PROCESS" }],
  ["STATE", { code: "machine_state", category: "MACHINE_STATE" }],
]);

// n samples of one signal, 1 s apart, values from fn(i)
function series(signal: string, n: number, fn: (i: number) => number | null, stepMs = 1000): QSample[] {
  return Array.from({ length: n }, (_, i) => {
    const v = fn(i);
    return { id: `${signal}-${i}`, signal, tsMs: T0 + i * stepMs, value: v, quality: v === null ? "MISSING" : "VALID" } as QSample;
  });
}
const noise = (i: number) => 120 + ((i * 7) % 5) * 0.2; // deterministic small noise

test("clean signal with known sampling interval is VALID", () => {
  const a = assess({ samples: series("P1", 60, noise), tagMap: tags, samplingIntervalMs: 1000 });
  assert.equal(a.verdict, "VALID");
  assert.deepEqual(a.signals[0], { signal: "P1", verdict: "VALID", reasons: [], validSamples: 60, quarantinedSamples: 0 });
  assert.equal(a.quarantined.length, 0);
  assert.equal(a.rulesetVersion, "v0-uncalibrated");
});

test("unknown sampling interval -> INSUFFICIENT_DATA, never assumed", () => {
  const a = assess({ samples: series("P1", 60, noise), tagMap: tags, samplingIntervalMs: null });
  assert.equal(a.verdict, "INSUFFICIENT_DATA");
  assert.deepEqual(a.signals[0]!.reasons, ["SAMPLING_METADATA_MISSING"]);
});

test("single-sample spike is quarantined, neighbours are not", () => {
  const a = assess({ samples: series("P1", 60, (i) => (i === 30 ? 400 : noise(i))), tagMap: tags, samplingIntervalMs: 1000 });
  assert.equal(a.verdict, "QUARANTINED");
  assert.deepEqual(a.quarantined.map((q) => [q.runMetricId, q.reason]), [["P1-30", "SPIKE"]]);
  assert.equal(a.signals[0]!.validSamples, 59);
});

test("a real step change (setpoint move) is NOT a spike", () => {
  const a = assess({ samples: series("P1", 60, (i) => (i < 30 ? 120 : 140) + ((i * 7) % 5) * 0.2), tagMap: tags, samplingIntervalMs: 1000 });
  assert.equal(a.verdict, "VALID");
  assert.equal(a.quarantined.length, 0);
});

test("sustained excursion stays visible (process behaviour, not measurement error)", () => {
  const a = assess({ samples: series("P1", 60, (i) => (i >= 20 && i < 40 ? 400 : noise(i))), tagMap: tags, samplingIntervalMs: 1000 });
  assert.equal(a.quarantined.length, 0);
});

test("missing / suspect source samples are quarantined as SOURCE_FLAGGED", () => {
  const s = series("P1", 30, (i) => (i === 5 ? null : noise(i)));
  s[6] = { ...s[6]!, value: null, quality: "SUSPECT" };
  const a = assess({ samples: s, tagMap: tags, samplingIntervalMs: 1000 });
  assert.deepEqual(a.quarantined.map((q) => [q.runMetricId, q.reason, q.detail]),
    [["P1-5", "SOURCE_FLAGGED", "MISSING"], ["P1-6", "SOURCE_FLAGGED", "SUSPECT"]]);
  assert.equal(a.signals[0]!.verdict, "QUARANTINED");
});

test("duplicate timestamps: both samples quarantined", () => {
  const s = series("P1", 30, noise);
  s.push({ id: "P1-dup", signal: "P1", tsMs: T0 + 10_000, value: 121, quality: "VALID" });
  const a = assess({ samples: s, tagMap: tags, samplingIntervalMs: 1000 });
  const dup = a.quarantined.filter((q) => q.reason === "TIMESTAMP_DUPLICATE").map((q) => q.runMetricId).sort();
  assert.deepEqual(dup, ["P1-10", "P1-dup"]);
});

test("small gap is reported, large gap makes the signal insufficient", () => {
  // one dropped sample = step of exactly 2x the interval: tolerated, not a gap
  const one = series("P1", 60, noise).filter((_, i) => i !== 30);
  assert.deepEqual(assess({ samples: one, tagMap: tags, samplingIntervalMs: 1000 }).signals[0]!.reasons, []);
  const small = series("P1", 60, noise).filter((_, i) => i !== 30 && i !== 31); // step 3x: a gap, coverage still ok
  const a = assess({ samples: small, tagMap: tags, samplingIntervalMs: 1000 });
  assert.equal(a.signals[0]!.verdict, "VALID");
  assert.deepEqual(a.signals[0]!.reasons, ["TIMESTAMP_GAP"]);
  const big = series("P1", 60, noise).filter((_, i) => i < 20 || i >= 40); // 1/3 missing
  const b = assess({ samples: big, tagMap: tags, samplingIntervalMs: 1000 });
  assert.equal(b.signals[0]!.verdict, "INSUFFICIENT_DATA");
});

test("unmapped column -> SIGNAL_NOT_MAPPED, no per-sample rows; run judged on mapped signals", () => {
  const s = [...series("P1", 60, noise), ...series("X9", 60, () => null).map((x) => ({ ...x, quality: "UNMAPPED" as const }))];
  const a = assess({ samples: s, tagMap: tags, samplingIntervalMs: 1000 });
  assert.equal(a.verdict, "VALID");
  assert.deepEqual(a.signals.find((r) => r.signal === "X9"), {
    signal: "X9", verdict: "INSUFFICIENT_DATA", reasons: ["SIGNAL_NOT_MAPPED"], validSamples: 0, quarantinedSamples: 0 });
  assert.equal(a.quarantined.length, 0);
});

test("no mapped signal at all -> run INSUFFICIENT_DATA", () => {
  const a = assess({ samples: series("X9", 20, noise), tagMap: tags, samplingIntervalMs: 1000 });
  assert.equal(a.verdict, "INSUFFICIENT_DATA");
});

test("too few valid samples -> INSUFFICIENT_DATA", () => {
  const a = assess({ samples: series("P1", 5, noise), tagMap: tags, samplingIntervalMs: 1000 });
  assert.deepEqual(a.signals[0]!.reasons, ["TOO_FEW_VALID_SAMPLES"]);
});

test("machine-state signals are not checked for numeric spikes", () => {
  const a = assess({ samples: series("STATE", 30, (i) => (i === 15 ? 3 : 1)), tagMap: tags, samplingIntervalMs: 1000 });
  assert.equal(a.quarantined.length, 0);
});

test("flatline and physical bounds apply only when configured for the signal", () => {
  const flat = series("P1", 120, () => 120);
  assert.equal(assess({ samples: flat, tagMap: tags, samplingIntervalMs: 1000 }).quarantined.length, 0);
  const rs: Ruleset = { ...RULESET_V0, overrides: {
    pressure: { flatline: { minSeconds: 60, minSamples: 10 }, bounds: { min: 0, max: 1000 } } } };
  const a = assess({ samples: flat, tagMap: tags, samplingIntervalMs: 1000, ruleset: rs });
  assert.equal(a.quarantined.filter((q) => q.reason === "FLATLINE").length, 120);
  const neg = series("P1", 30, (i) => (i === 3 ? -5 : noise(i)));
  const b = assess({ samples: neg, tagMap: tags, samplingIntervalMs: 1000, ruleset: rs });
  assert.deepEqual(b.quarantined.map((q) => [q.runMetricId, q.reason]), [["P1-3", "PHYSICALLY_IMPOSSIBLE"]]);
});

test("each (sample, reason) is recorded once", () => {
  const s = series("P1", 30, noise);
  s.push({ ...s[4]!, id: "P1-4b", value: null, quality: "MISSING" });
  const a = assess({ samples: s, tagMap: tags, samplingIntervalMs: 1000 });
  const keys = a.quarantined.map((q) => `${q.runMetricId}:${q.reason}`);
  assert.equal(new Set(keys).size, keys.length);
});
