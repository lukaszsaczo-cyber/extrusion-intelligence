import assert from "node:assert/strict";
import { test } from "node:test";
import { buildChains, buildEvents, type HistoryInput } from "./timeline.ts";

const empty: HistoryInput = { runs: [], plans: [], files: [], quality: [], diagnoses: [], measurements: [], verifications: [], audits: [], predictions: [] };
const run = (id: string, plan: string | null, extra: Partial<HistoryInput["runs"][number]> = {}) => ({
  id, run_code: id.toUpperCase(), status: "PLANNED", process_plan_id: plan, started_at: null, ended_at: null,
  created_at: "2026-09-01T08:00:00Z", created_by: "u1", ...extra,
});

test("a run with no records has every step NOT_AVAILABLE, never DONE", () => {
  const [c] = buildChains({ ...empty, runs: [run("r1", null)] });
  assert.deepEqual([c!.decision, c!.approval, c!.run_step, c!.actual, c!.verification].map((s) => s.state),
    ["NOT_AVAILABLE", "NOT_AVAILABLE", "NOT_AVAILABLE", "NOT_AVAILABLE", "NOT_AVAILABLE"]);
});

test("a plan without an engine decision is NOT_AVAILABLE; the chain follows stored rows", () => {
  const input: HistoryInput = {
    ...empty,
    runs: [run("r1", "p1", { started_at: "2026-09-01T09:00:00Z", status: "RUNNING" }), run("r2", "p2")],
    plans: [
      { id: "p1", preflight_status: "READY_FOR_OPERATOR_REVIEW", preflight_at: "2026-09-01T07:00:00Z", approved_by: "u2", approved_at: "2026-09-01T07:30:00Z", created_at: "2026-09-01T06:00:00Z", created_by: "u1" },
      { id: "p2", preflight_status: null, preflight_at: null, approved_by: null, approved_at: null, created_at: "2026-09-01T06:00:00Z", created_by: "u1" },
    ],
    files: [{ run_id: "r1", filename: "a.csv", created_at: "2026-09-01T10:00:00Z", created_by: "u3" }],
    verifications: [
      { run_id: "r1", kind: "PRODUCT", state: "INCOMPLETE", verified_at: "2026-09-01T11:00:00Z", created_at: "2026-09-01T11:00:00Z", created_by: null },
      { run_id: "r1", kind: "PRODUCT", state: "VERIFIED_FAIL", verified_at: "2026-09-01T12:00:00Z", created_at: "2026-09-01T12:00:00Z", created_by: null },
    ],
  };
  const [c1, c2] = buildChains(input);
  assert.deepEqual([c1!.decision.state, c1!.decision.label, c1!.approval.state, c1!.run_step.label, c1!.actual.label, c1!.verification.label],
    ["DONE", "READY_FOR_OPERATOR_REVIEW", "DONE", "RUNNING", "1", "VERIFIED_FAIL"]);
  assert.equal(c2!.decision.state, "NOT_AVAILABLE");
  assert.equal(c2!.approval.state, "NOT_AVAILABLE");
});

test("events are newest first, carry the stored user, and the engine decision has no user", () => {
  const ev = buildEvents({
    ...empty,
    runs: [run("r1", "p1", { started_at: "2026-09-01T09:00:00Z" })],
    plans: [{ id: "p1", preflight_status: "TEST_REQUIRED", preflight_at: "2026-09-01T07:00:00Z", approved_by: "u2", approved_at: "2026-09-01T07:30:00Z", created_at: "2026-09-01T06:00:00Z", created_by: "u1" }],
    predictions: [{ process_plan_id: "p1", metric: "pressure", created_at: "2026-09-01T07:00:00Z" }],
    measurements: [{ run_id: "r1", parameter: "density", created_at: "2026-09-01T10:00:00Z", created_by: "u3" }],
    audits: [{ id: "a1", run_id: "r1", created_at: "2026-09-01T13:00:00Z", created_by: "u1" }],
  });
  assert.deepEqual(ev.map((e) => [e.kind, e.by, e.run_id]), [
    ["AUDIT_SEALED", "u1", "r1"], ["MEASUREMENT", "u3", "r1"], ["RUN_STARTED", null, "r1"], ["RUN_CREATED", "u1", "r1"],
    ["APPROVAL", "u2", "r1"], ["DECISION", null, "r1"], ["PREDICTION", null, "r1"], ["PLAN_CREATED", "u1", "r1"],
  ]);
});
