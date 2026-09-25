import test from "node:test";
import assert from "node:assert/strict";
import { buildSnapshot, canonicalJson, type SnapshotInput } from "./snapshot.ts";
import { evaluateGates } from "./gates.ts";
import type { QSample } from "../quality/rules.ts";

const T0 = Date.parse("2026-09-25T08:00:00Z");
const series = (signal: string, values: (number | null)[]): QSample[] =>
  values.map((v, i) => ({ id: `${signal}-${i}`, signal, tsMs: T0 + i * 1000, value: v, quality: v === null ? "MISSING" : "VALID" }));

const base = (over: Partial<SnapshotInput> = {}): SnapshotInput => ({
  run: { id: "run-1", runCode: "R1", processPlanId: null },
  machine: { id: "m-1", screwDiameterMm: 32, lD: 40, drivePowerKw: 30, maxRpm: 900, maxPressureBar: 150, zoneCount: 8 },
  samplingIntervalMs: 1000,
  assessment: { id: "qa-1", rulesetVersion: "v0-uncalibrated", verdict: "QUARANTINED" },
  signalVerdicts: new Map([["P1", "QUARANTINED"], ["T1", "VALID"]]),
  samples: [...series("P1", [100, 110, 400, 120, null, 130]), ...series("T1", Array(12).fill(180)), ...series("X9", [1, 2])],
  quarantinedIds: new Set(["P1-2", "P1-4"]),
  tagMap: new Map([
    ["P1", { code: "pressure", category: "PROCESS" as const, unit: "bar" }],
    ["T1", { code: "melt_temperature", category: "PROCESS" as const, unit: "°C" }],
  ]),
  limits: [
    { parameter: "pressure", bound: "MAX", value: 125, unit: "bar" },
    { parameter: "melt_temperature", bound: "MAX", value: 175, unit: "K" }, // unit differs
  ],
  references: { planPredictions: 0, productTargetValues: 0 },
  ...over,
});

test("snapshot uses only clean samples; quarantined and missing are excluded", () => {
  const s = buildSnapshot(base());
  const p = s.signals.find((x) => x.tag === "P1")!;
  assert.equal(p.n, 4); // 100,110,120,130 — spike 400 and missing excluded
  assert.deepEqual([p.min, p.max, p.mean, p.median], [100, 130, 115, 115]);
  assert.equal(p.firstTs, "2026-09-25T08:00:00.000Z");
  assert.deepEqual(s.totals, { samples: 20, cleanSamples: 16, quarantinedSamples: 2 });
  assert.deepEqual(s.unmappedTags, ["X9"]);
});

test("limit exceedance is reported as evidence (not quarantined), only when units match", () => {
  const s = buildSnapshot(base());
  const p = s.signals.find((x) => x.tag === "P1")!;
  assert.equal(p.limitMax, 125);
  assert.equal(p.samplesAboveMax, 1); // 130 > 125
  assert.equal(p.samplesBelowMin, null); // no MIN limit
  const t = s.signals.find((x) => x.tag === "T1")!;
  assert.equal(t.limitMax, 175);
  assert.equal(t.samplesAboveMax, null); // K vs °C: not compared, not assumed
});

test("canonical JSON is key-order independent", () => {
  assert.equal(canonicalJson({ b: 1, a: [2, { d: null, c: "x" }] }), canonicalJson({ a: [2, { c: "x", d: null }], b: 1 }));
  assert.equal(canonicalJson({ b: 1, a: 2 }), '{"a":2,"b":1}');
  const s1 = buildSnapshot(base());
  const s2 = buildSnapshot(base({ samples: [...base().samples].reverse() }));
  assert.equal(canonicalJson(s1), canonicalJson(s2)); // input order does not change the snapshot
});

test("gates v0: never ready — machine stability, persistence and separability are undefined", () => {
  const g = evaluateGates(buildSnapshot(base({ samples: [
    ...series("P1", Array.from({ length: 20 }, (_, i) => 100 + i)), ...series("T1", Array(20).fill(180)) ],
    quarantinedIds: new Set() })));
  assert.equal(g.status, "INSUFFICIENT_DATA");
  assert.deepEqual(g.gates.map((x) => [x.id, x.status, x.reason]), [
    ["DATA_RELIABLE", "PASS", "QUALITY_OK"],
    ["MACHINE_STABLE", "UNKNOWN", "RESIDENCE_TIME_UNDEFINED"],
    ["DEVIATION_PERSISTENT", "UNKNOWN", "NO_REFERENCE"],
    ["COUPLED_SIGNALS", "PASS", "COUPLED_OK"],
    ["CAUSE_SEPARABLE", "UNKNOWN", "COMPARISON_RUNS_REQUIRED"],
  ]);
});

test("gates: insufficient quality and too few coupled signals FAIL", () => {
  const g = evaluateGates(buildSnapshot(base({ assessment: { id: "qa", rulesetVersion: "v0", verdict: "INSUFFICIENT_DATA" } })));
  assert.equal(g.gates[0]!.status, "FAIL");
  assert.equal(g.gates[0]!.reason, "QUALITY_INSUFFICIENT");
  // P1 has only 4 clean samples (< 10): one coupled signal left
  const c = g.gates.find((x) => x.id === "COUPLED_SIGNALS")!;
  assert.deepEqual([c.status, c.detail], ["FAIL", { signals: 1, required: 2 }]);
});

test("gates: a reference alone does not make persistence decidable", () => {
  const g = evaluateGates(buildSnapshot(base({ references: { planPredictions: 3, productTargetValues: 0 } })));
  const d = g.gates.find((x) => x.id === "DEVIATION_PERSISTENT")!;
  assert.deepEqual([d.status, d.reason], ["UNKNOWN", "STEADY_STATE_UNDEFINED"]);
});
