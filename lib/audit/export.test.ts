import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { AUDIT_SNAPSHOT_ALLOWLIST, applyAllowlist, buildAuditExport } from "./export.ts";

// Shape of a snapshot as seal_run_audit (0013) builds it.
const snapshot = {
  schema: "audit-v1", seq: 2, previous_hash: "a".repeat(64), sealed_at: "2026-09-25T10:00:00+00:00", sealed_by: "u1",
  run: { id: "r", run_code: "A-1", status: "COMPLETED", machine_id: "m", process_plan_id: "p", operator_id: null,
    started_at: null, ended_at: null, created_at: "t", created_by: "u1" },
  plan: { id: "p", version: 1, recipe_version_id: "rv", machine_id: "m", product_target_id: null, feed_kg_h: 100,
    screw_rpm: 300, water_kg_h: null, steam_kg_h: null, cutter_rpm: null, zone_setpoints_c: [80, 100, 120],
    screw_configuration: null, die: null, cutter: null,
    decision: { status: "READY_FOR_OPERATOR_REVIEW", confidence_label: "LOW", risk_categories: ["VALIDATION_REQUIRED"],
      missing_inputs: [], decided_at: "t",
      proposed_test: { parameter: null, current: null, proposed: null, unit: null, zone: null, observe_s: null } },
    approval: { approved_by: "u2", approved_at: "t" }, created_at: "t", created_by: "u1" },
  files: [{ id: "f", filename: "run.csv", sha256: "b".repeat(64), size_bytes: 10, row_count: 2, column_count: 3, created_at: "t", created_by: "u1" }],
  quality: [], state_snapshots: [], diagnoses: [], predictions: [],
  measurements: [{ sample_code: "S1", taken_at: null, parameter: "density", value: 410.5, unit: "g/l", method: null, created_at: "t", created_by: "u3" }],
  verifications: [],
};

test("a real audit-v1 snapshot is exported unchanged, nothing dropped", () => {
  const r = applyAllowlist(snapshot, AUDIT_SNAPSHOT_ALLOWLIST);
  assert.equal(r.dropped, 0);
  assert.deepEqual(r.value, snapshot);
});

test("fields outside the allowlist are dropped at every level, only counted", () => {
  const leaky = structuredClone(snapshot) as unknown as {
    [k: string]: unknown; plan: { decision: Record<string, unknown> }; files: Record<string, unknown>[]; measurements: unknown[];
  };
  leaky.engine_internal = { weights: [1, 2] };
  leaky.plan.decision.private_score = 0.93;
  leaky.files[0].storage_path = "org/secret/path";
  leaky.measurements.push({ ...snapshot.measurements[0], operator_note: "x" });
  const out = buildAuditExport({ id: "a", run_id: "r", created_at: "t", final_hash: "c".repeat(64), snapshot: leaky },
    { seq: 2, hash_ok: true, chain_ok: true }, "2026-09-25T12:00:00Z");
  assert.equal(out.dropped_field_count, 4);
  const text = JSON.stringify(out);
  for (const secret of ["engine_internal", "weights", "private_score", "storage_path", "org/secret/path", "operator_note"]) {
    assert.ok(!text.includes(secret), `${secret} leaked`);
  }
});

test("a listed name cannot carry an unlisted subtree", () => {
  // run_code is a scalar field: an object in its place is dropped, not exported.
  const r = applyAllowlist({ run: { run_code: { token: "s3cret" } } }, AUDIT_SNAPSHOT_ALLOWLIST);
  assert.deepEqual(r.value, { run: {} });
  assert.equal(r.dropped, 1);
  // an array where an object is expected, and an object where an array is expected
  assert.deepEqual(applyAllowlist({ plan: [{ id: "x" }], files: { id: "x" } }, AUDIT_SNAPSHOT_ALLOWLIST).value, {});
});

test("null stays null (a run without a plan exports plan: null), integrity null = not available", () => {
  const out = buildAuditExport({ id: "a", run_id: "r", created_at: "t", final_hash: "c".repeat(64), snapshot: { ...snapshot, plan: null } },
    null, "2026-09-25T12:00:00Z");
  assert.equal((out.snapshot as Record<string, unknown>).plan, null);
  assert.equal(out.integrity, null);
});

test("allowlist covers exactly the keys seal_run_audit builds (migration 0019, audit-v3)", () => {
  const dir = new URL("../../supabase/migrations/", import.meta.url);
  const sql = readFileSync(new URL("20260926091246_0019_fail_loop_order_a.sql", dir), "utf8");
  const seal = sql.slice(sql.indexOf("create or replace function public.seal_run_audit"));
  const body = seal.slice(seal.indexOf("v_snap := jsonb_build_object("), seal.indexOf("insert into public.audit_records"));
  // keys are the quoted literals followed by a comma inside jsonb_build_object(...)
  const keys = new Set([...body.matchAll(/'([a-z_0-9]+)',\s/g)].map((m) => m[1]!));
  keys.delete("audit-v3"); // value, not a key
  const specKeys = new Set<string>();
  const walk = (s: unknown) => {
    if (Array.isArray(s)) return walk(s[0]);
    if (s && typeof s === "object") for (const [k, v] of Object.entries(s)) { specKeys.add(k); walk(v); }
  };
  walk(AUDIT_SNAPSHOT_ALLOWLIST);
  assert.deepEqual([...keys].sort(), [...specKeys].sort());
});
