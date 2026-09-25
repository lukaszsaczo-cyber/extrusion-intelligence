// Diagnosis preconditions. A cause may be named only when EVERY gate passes;
// otherwise the result is INSUFFICIENT_DATA with the list of what is missing.
// Never a forced diagnosis. Pure, no I/O.
//
// Order (agreed rule chain):
//   1. DATA_RELIABLE        quality check done and not INSUFFICIENT_DATA
//   2. MACHINE_STABLE       steady state reached (needs residence time + setpoint tags)
//   3. DEVIATION_PERSISTENT deviation from a reference lasts beyond steady state
//   4. COUPLED_SIGNALS      >= 2 physically coupled process signals with clean data
//   5. CAUSE_SEPARABLE      recipe / material / machine can be told apart (needs comparison runs)
//
// v0 honestly cannot decide 2, 3 and 5: the definitions they need do not exist
// yet. They report UNKNOWN with the missing input instead of guessing, so no
// run can reach a diagnosis until those inputs are defined.

import type { Snapshot } from "./snapshot";

export type GateId = "DATA_RELIABLE" | "MACHINE_STABLE" | "DEVIATION_PERSISTENT" | "COUPLED_SIGNALS" | "CAUSE_SEPARABLE";
export type GateStatus = "PASS" | "FAIL" | "UNKNOWN";
export type GateReason =
  | "QUALITY_OK" | "QUALITY_INSUFFICIENT"
  | "RESIDENCE_TIME_UNDEFINED"
  | "NO_REFERENCE" | "STEADY_STATE_UNDEFINED"
  | "COUPLED_OK" | "TOO_FEW_COUPLED_SIGNALS"
  | "COMPARISON_RUNS_REQUIRED";
export type Gate = { id: GateId; status: GateStatus; reason: GateReason; detail?: Record<string, number | string> };
export type GateOutcome = { gates: Gate[]; status: "READY_FOR_ENGINE" | "INSUFFICIENT_DATA" };

export const MIN_CLEAN_SAMPLES = 10;
export const GATES_VERSION = "gates-v0";

export function evaluateGates(s: Snapshot): GateOutcome {
  const gates: Gate[] = [];

  gates.push(s.quality.verdict === "INSUFFICIENT_DATA"
    ? { id: "DATA_RELIABLE", status: "FAIL", reason: "QUALITY_INSUFFICIENT" }
    : { id: "DATA_RELIABLE", status: "PASS", reason: "QUALITY_OK" });

  gates.push({ id: "MACHINE_STABLE", status: "UNKNOWN", reason: "RESIDENCE_TIME_UNDEFINED" });

  const refs = s.references.planPredictions + s.references.productTargetValues;
  gates.push(refs === 0
    ? { id: "DEVIATION_PERSISTENT", status: "UNKNOWN", reason: "NO_REFERENCE" }
    : { id: "DEVIATION_PERSISTENT", status: "UNKNOWN", reason: "STEADY_STATE_UNDEFINED", detail: { references: refs } });

  const coupled = s.signals.filter((x) =>
    x.category === "PROCESS" && x.qualityVerdict !== "INSUFFICIENT_DATA" && x.n >= MIN_CLEAN_SAMPLES).length;
  gates.push(coupled >= 2
    ? { id: "COUPLED_SIGNALS", status: "PASS", reason: "COUPLED_OK", detail: { signals: coupled } }
    : { id: "COUPLED_SIGNALS", status: "FAIL", reason: "TOO_FEW_COUPLED_SIGNALS", detail: { signals: coupled, required: 2 } });

  gates.push({ id: "CAUSE_SEPARABLE", status: "UNKNOWN", reason: "COMPARISON_RUNS_REQUIRED" });

  return { gates, status: gates.every((g) => g.status === "PASS") ? "READY_FOR_ENGINE" : "INSUFFICIENT_DATA" };
}
