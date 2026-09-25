import assert from "node:assert/strict";
import { test } from "node:test";
import { filesByRun, liveView, recordedState } from "./state.ts";

test("live view is never available in V1", () => {
  assert.deepEqual(liveView(), { available: false, reason: "NO_LIVE_SOURCE" });
});

test("machine state comes only from recorded runs", () => {
  assert.equal(recordedState([]), "NO_RUNS");
  assert.equal(recordedState([{ status: "COMPLETED" }, { status: "PLANNED" }]), "NO_RECORDED_RUNNING");
  assert.equal(recordedState([{ status: "COMPLETED" }, { status: "RUNNING" }]), "RECORDED_RUNNING");
});

test("imported files are grouped per run in import order with name and time", () => {
  const m = filesByRun([
    { run_id: "r1", filename: "b.csv", created_at: "2026-09-25T10:00:00Z" },
    { run_id: "r2", filename: "c.csv", created_at: "2026-09-25T09:00:00Z" },
    { run_id: "r1", filename: "a.csv", created_at: "2026-09-25T08:00:00Z" },
  ]);
  assert.deepEqual(m.get("r1")!.map((f) => f.filename), ["a.csv", "b.csv"]);
  assert.equal(m.get("r2")![0]!.created_at, "2026-09-25T09:00:00Z");
  assert.equal(m.get("r3"), undefined);
});
