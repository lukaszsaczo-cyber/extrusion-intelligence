// FAIL loop steps, order A (migrations 0019/0020). The database decides; this
// module only mirrors its transition table so the UI offers the one step that
// can come next. steps.test.ts keeps it equal to the SQL. Pure, no I/O.

export const STEPS = [
  "DECOMPOSITION", "DIAGNOSIS", "EXTRACT", "PURGE", "CONSOLIDATE", "STATE_REFRESH",
  "INTERVENTION", "CONTROLLED_TEST", "VERIFICATION", "REPORT",
  "FILTER", "VERIFY_PERSIST", "LOCK", "CROSS", "AUDIT",
] as const;
export type Step = (typeof STEPS)[number];

// Names used in the specification (3 / 6 / 28 / 38 / 39 / 40 are codes, not thresholds).
export const SPEC_NAME: Record<Step, string> = {
  DECOMPOSITION: "ROZPAD I", DIAGNOSIS: "SZCZEGÓŁOWA DIAGNOZA", EXTRACT: "3 EXTRACT", PURGE: "6 PURGE",
  CONSOLIDATE: "28 CONSOLIDATE", STATE_REFRESH: "ODŚWIEŻENIE STANU", INTERVENTION: "NAPRAWA",
  CONTROLLED_TEST: "CONTROLLED TEST", VERIFICATION: "WERYFIKACJA", REPORT: "RAPORT",
  FILTER: "38 FILTR", VERIFY_PERSIST: "39 VERIFY + PERSIST", LOCK: "40 LOCK", CROSS: "CROSS", AUDIT: "AUDIT",
};

// Steps that take a reference to an existing record.
export const REF_STEPS: readonly Step[] = ["DIAGNOSIS", "EXTRACT", "CONSOLIDATE", "INTERVENTION", "CONTROLLED_TEST", "VERIFICATION", "AUDIT"];

// Conditions: DIAGNOSED / NOT_DIAGNOSED = status of the latest DIAGNOSIS step;
// PASS = the case outcome is VERIFIED_PASS with saved evidence.
export type Condition = "DIAGNOSED" | "NOT_DIAGNOSED" | "PASS" | null;

export const TRANSITIONS: readonly [Step, Step, Condition][] = [
  ["DECOMPOSITION", "DIAGNOSIS", null],
  ["DIAGNOSIS", "EXTRACT", null],
  ["EXTRACT", "PURGE", null],
  ["PURGE", "CONSOLIDATE", null],
  ["CONSOLIDATE", "STATE_REFRESH", null],
  ["STATE_REFRESH", "INTERVENTION", "DIAGNOSED"],
  ["STATE_REFRESH", "DIAGNOSIS", "NOT_DIAGNOSED"],
  ["INTERVENTION", "CONTROLLED_TEST", null],
  ["CONTROLLED_TEST", "VERIFICATION", null],
  ["VERIFICATION", "REPORT", null],
  ["REPORT", "FILTER", "PASS"],
  ["FILTER", "VERIFY_PERSIST", null],
  ["VERIFY_PERSIST", "LOCK", null],
  ["LOCK", "CROSS", null],
  ["CROSS", "AUDIT", null],
];

export type LoopState = {
  open: boolean;
  lastStep: string | null;
  diagnosisStatus: string | null; // status of the latest DIAGNOSIS step, null if none
  pass: boolean;                  // outcome VERIFIED_PASS with saved evidence
};

// The next step, or null when the case is closed or nothing can follow.
export function nextStep(s: LoopState): Step | null {
  if (!s.open || !s.lastStep) return null;
  const ok = (cond: Condition) =>
    cond === null ? true
      : cond === "PASS" ? s.pass
        : cond === "DIAGNOSED" ? s.diagnosisStatus === "DIAGNOSED"
          : s.diagnosisStatus !== null && s.diagnosisStatus !== "DIAGNOSED";
  const hit = TRANSITIONS.find(([from, , cond]) => from === s.lastStep && ok(cond));
  return hit ? hit[1] : null;
}

// An attempt can be closed with a reason only before VERIFICATION sets an outcome.
export function canClose(c: { status: string; outcome: string | null }): boolean {
  return c.status === "OPEN" && c.outcome === null;
}
