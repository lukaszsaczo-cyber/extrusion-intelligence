import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { toContractAuditArgs } from "./contract-record.ts";

const require = createRequire(import.meta.url);
// The real contract implementation, not a copy.
const S = require("../../server/engine-contract/src/sanitizer.js");
const build = (a: ReturnType<typeof toContractAuditArgs>) =>
  S.buildAuditExport(a.record, a.preflight, a.processVerification, a.productVerification, a.finalStatus);

const v2 = {
  schema: "audit-v2",
  organization: { id: "o", name: "Zakład A" }, site: { id: "s", name: "Hala 2" },
  machine: { id: "m", manufacturer: "Clextral", model: "EV32", variant: null, serial_number: "SN-1",
    configuration: { screw_diameter_mm: 32, l_d: 28, drive_power_kw: null, configured_max_rpm: 800, configured_max_pressure_bar: null, zone_count: 6, controller_version: null, software_version: null } },
  recipe_version: { id: "rv", recipe: "Chrupki", version: 3, status: "FINAL" },
  run: { id: "r", operator_id: "u-op", started_at: "2026-09-26T06:00:00+00:00", ended_at: "2026-09-26T08:00:00+00:00" },
  plan: { id: "p", version: 2, decision: { status: "TEST_REQUIRED" } },
  files: [{ filename: "run.csv", sha256: "a".repeat(64) }],
  verifications: [
    { kind: "ENGINE", state: "VERIFIED_PASS", verified_at: "2026-09-26T09:00:00Z" },
    { kind: "PRODUCT", state: "INCOMPLETE", verified_at: "2026-09-26T08:30:00Z" },
    { kind: "PRODUCT", state: "VERIFIED_FAIL", verified_at: "2026-09-26T08:40:00Z" },
  ],
};

test("audit-v2 snapshot -> the contract's audit export, all AUDIT_FIELDS, reproducible hash", () => {
  const out = build(toContractAuditArgs("a1", v2));
  assert.deepEqual(new Set(Object.keys(out)), new Set([...S.AUDIT_FIELDS, "preflightDecision", "processVerification", "productVerification", "finalStatus", "finalAuditHash"]));
  assert.equal(out.organization, "Zakład A");
  assert.equal(out.site, "Hala 2");
  assert.equal(out.machine, "Clextral EV32");
  assert.equal(out.serialNumber, "SN-1");
  assert.equal(out.operator, "u-op");
  assert.equal(out.importedFilename, "run.csv");
  assert.equal(out.preflightDecision, "TEST_REQUIRED");
  assert.equal(out.productVerification, "VERIFIED_FAIL"); // latest PRODUCT
  assert.match(out.finalAuditHash, /^[0-9a-f]{64}$/);
  assert.equal(build(toContractAuditArgs("a1", v2)).finalAuditHash, out.finalAuditHash);
});

test("the engine's whole-run verification is not mapped to process, product or final", () => {
  const out = build(toContractAuditArgs("a1", { ...v2, verifications: [v2.verifications[0]] }));
  assert.equal(out.processVerification, null);
  assert.equal(out.productVerification, null);
  assert.equal(out.finalStatus, null);
});

test("audit-v1 snapshot: missing fields are null, never guessed; several files -> lists", () => {
  const out = build(toContractAuditArgs("a1", {
    schema: "audit-v1", run: { id: "r", operator_id: null, started_at: null, ended_at: null }, plan: null,
    files: [{ filename: "a.csv", sha256: "1".repeat(64) }, { filename: "b.csv", sha256: "2".repeat(64) }], verifications: [],
  }));
  for (const k of ["organization", "site", "machine", "serialNumber", "machineConfigSnapshot", "recipeVersion", "processPlanVersion", "operator", "preflightDecision"]) {
    assert.equal(out[k], null, k);
  }
  assert.deepEqual(out.importedFilename, ["a.csv", "b.csv"]);
});
