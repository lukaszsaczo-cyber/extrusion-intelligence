// FAIL loop steps, working canon (migrations 0019-0021, docs/CANON.md). The
// database decides; this module only mirrors its transition table so the UI
// offers the one step that can come next. steps.test.ts keeps it equal to the SQL. Pure, no I/O.

export const STEPS = [
  "DECOMPOSITION", "DIAGNOSIS", "EXTRACT", "PURGE", "CONSOLIDATE", "STATE_REFRESH",
  "INTERVENTION", "CONTROLLED_TEST", "VERIFICATION",
  "FILTER", "VERIFY_PERSIST", "LOCK", "CROSS", "AUDIT",
] as const;
export type Step = (typeof STEPS)[number];

// Names used in the specification (3 / 6 / 28 / 38 / 39 / 40 are codes, not thresholds).
export const SPEC_NAME: Record<Step, string> = {
  DECOMPOSITION: "ROZPAD I", DIAGNOSIS: "SZCZEGÓŁOWA DIAGNOZA", EXTRACT: "3 ODDZIELENIE", PURGE: "6 FILTR / WYKLUCZENIE",
  CONSOLIDATE: "28 KONSOLIDACJA", STATE_REFRESH: "ODŚWIEŻENIE STANU", INTERVENTION: "NAPRAWA",
  CONTROLLED_TEST: "TEST", VERIFICATION: "WERYFIKACJA", FILTER: "38 FILTR DOWODÓW",
  VERIFY_PERSIST: "39 WERYFIKACJA + UTRWALENIE", LOCK: "40 LOCK / READ_ONLY", CROSS: "CROSS", AUDIT: "AUDIT",
};

// Steps that take a reference to an existing record.
export const REF_STEPS: readonly Step[] = ["DIAGNOSIS", "EXTRACT", "CONSOLIDATE", "INTERVENTION", "CONTROLLED_TEST", "VERIFICATION", "AUDIT"];

// Conditions: status of the latest DIAGNOSIS step. After WERYFIKACJA always 38, the
// evidence gate: it passes to 39 or closes the case (the database decides).
export type Condition = "DIAGNOSED" | "NOT_DIAGNOSED" | null;

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
  ["VERIFICATION", "FILTER", null],
  ["FILTER", "VERIFY_PERSIST", null],
  ["VERIFY_PERSIST", "LOCK", null],
  ["LOCK", "CROSS", null],
  ["CROSS", "AUDIT", null],
];

export type LoopState = {
  open: boolean;
  lastStep: string | null;
  diagnosisStatus: string | null; // status of the latest DIAGNOSIS step, null if none
};

// The next step, or null when the case is closed or nothing can follow.
export function nextStep(s: LoopState): Step | null {
  if (!s.open || !s.lastStep) return null;
  const ok = (cond: Condition) =>
    cond === null ? true
      : cond === "DIAGNOSED" ? s.diagnosisStatus === "DIAGNOSED"
        : s.diagnosisStatus !== null && s.diagnosisStatus !== "DIAGNOSED";
  const hit = TRANSITIONS.find(([from, , cond]) => from === s.lastStep && ok(cond));
  return hit ? hit[1] : null;
}

// An attempt can be closed with a reason only before WERYFIKACJA sets an outcome.
export function canClose(c: { status: string; outcome: string | null }): boolean {
  return c.status === "OPEN" && c.outcome === null;
}
