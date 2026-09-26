// FAIL loop steps (migration 0018). The database decides; this module only
// mirrors its transition table so the UI offers the one step that can come
// next. steps.test.ts keeps it equal to the SQL. Pure, no I/O.

export const STEPS = [
  "DECOMPOSITION", "SEPARATION", "QUARANTINE", "CONSOLIDATION", "STATE_REFRESH",
  "DIAGNOSIS", "INTERVENTION", "CONTROLLED_TEST", "VERIFICATION",
] as const;
export type Step = (typeof STEPS)[number];

// Names used in the specification.
export const SPEC_NAME: Record<Step, string> = {
  DECOMPOSITION: "ROZPAD I", SEPARATION: "3", QUARANTINE: "6", CONSOLIDATION: "28",
  STATE_REFRESH: "ODŚWIEŻENIE", DIAGNOSIS: "DIAGNOZA", INTERVENTION: "NAPRAWA / ODDZIAŁYWANIE",
  CONTROLLED_TEST: "CONTROLLED TEST", VERIFICATION: "VERIFICATION",
};

// [from, to, condition on the last diagnosis status]
export const TRANSITIONS: readonly [Step, Step, "DIAGNOSED" | "NOT_DIAGNOSED" | null][] = [
  ["DECOMPOSITION", "SEPARATION", null],
  ["SEPARATION", "QUARANTINE", null],
  ["QUARANTINE", "CONSOLIDATION", null],
  ["CONSOLIDATION", "STATE_REFRESH", null],
  ["STATE_REFRESH", "DIAGNOSIS", null],
  ["DIAGNOSIS", "INTERVENTION", "DIAGNOSED"],
  ["DIAGNOSIS", "QUARANTINE", "NOT_DIAGNOSED"],
  ["INTERVENTION", "CONTROLLED_TEST", null],
  ["CONTROLLED_TEST", "VERIFICATION", null],
];

// The next step, or null when the case is closed or the last record is unknown.
export function nextStep(last: { step: string; payload: { status?: unknown } } | null, open: boolean): Step | null {
  if (!open || !last) return null;
  const status = typeof last.payload?.status === "string" ? last.payload.status : null;
  const hit = TRANSITIONS.find(([from, , cond]) => from === last.step && (cond === null
    || (cond === "DIAGNOSED" ? status === "DIAGNOSED" : status !== null && status !== "DIAGNOSED")));
  return hit ? hit[1] : null;
}

export const KNOWLEDGE_STAGES = ["S38", "S39", "S40", "CROSS"] as const;
export type KnowledgeStage = (typeof KNOWLEDGE_STAGES)[number];

// Knowledge only after a verified PASS with saved evidence, stages in order.
export function nextKnowledgeStage(c: { status: string; outcome: string | null; outcome_evidence_saved: boolean }, done: string[]): KnowledgeStage | null {
  if (c.status !== "CLOSED" || c.outcome !== "VERIFIED_PASS" || !c.outcome_evidence_saved) return null;
  return KNOWLEDGE_STAGES.find((s) => !done.includes(s)) ?? null;
}
