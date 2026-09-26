// JSON export of one audit record. Only allowlisted fields leave the app: the
// allowlist mirrors the audit-v2 snapshot built by seal_run_audit (0017; audit-v1
// from 0013 is a subset). Any
// field not listed (for example one added later, or a private engine field) is
// dropped, never passed through. Objects and arrays are exported only where the
// allowlist describes their shape, so a whole subtree can never slip out under
// a listed name. Pure, no I/O.

export type Spec = true | readonly [Spec] | { readonly [key: string]: Spec };

const WHO_WHEN = { created_at: true, created_by: true } as const;

export const AUDIT_SNAPSHOT_ALLOWLIST = {
  schema: true, seq: true, previous_hash: true, sealed_at: true, sealed_by: true,
  // audit-v2 (0017)
  organization: { id: true, name: true },
  site: { id: true, name: true },
  machine: {
    id: true, manufacturer: true, model: true, variant: true, serial_number: true,
    configuration: {
      screw_diameter_mm: true, l_d: true, drive_power_kw: true, configured_max_rpm: true,
      configured_max_pressure_bar: true, zone_count: true, controller_version: true, software_version: true,
    },
  },
  recipe_version: { id: true, recipe: true, version: true, status: true },
  run: {
    id: true, run_code: true, status: true, machine_id: true, process_plan_id: true, operator_id: true,
    started_at: true, ended_at: true, ...WHO_WHEN,
  },
  plan: {
    id: true, version: true, recipe_version_id: true, machine_id: true, product_target_id: true,
    feed_kg_h: true, screw_rpm: true, water_kg_h: true, steam_kg_h: true, cutter_rpm: true,
    zone_setpoints_c: [true], screw_configuration: true, die: true, cutter: true,
    decision: {
      status: true, confidence_label: true, risk_categories: [true], missing_inputs: [true], decided_at: true,
      proposed_test: { parameter: true, current: true, proposed: true, unit: true, zone: true, observe_s: true },
    },
    approval: { approved_by: true, approved_at: true },
    ...WHO_WHEN,
  },
  files: [{ id: true, filename: true, sha256: true, size_bytes: true, row_count: true, column_count: true, ...WHO_WHEN }],
  quality: [{ id: true, ruleset_version: true, verdict: true, ...WHO_WHEN }],
  state_snapshots: [{ id: true, quality_assessment_id: true, schema_version: true, sha256: true, ...WHO_WHEN }],
  diagnoses: [{ id: true, snapshot_id: true, gates_version: true, status: true, cause_category: true, confidence_label: true, ...WHO_WHEN }],
  predictions: [{ metric: true, kind: true, value: true, min_value: true, max_value: true, unit: true, created_at: true }],
  measurements: [{ sample_code: true, taken_at: true, parameter: true, value: true, unit: true, method: true, ...WHO_WHEN }],
  verifications: [{ id: true, kind: true, state: true, evidence_saved: true, verified_at: true, ...WHO_WHEN }],
} as const satisfies Spec;

const isScalar = (v: unknown) => v === null || ["string", "number", "boolean"].includes(typeof v);
const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

// Returns the filtered value and how many fields were dropped. A value whose
// shape does not match the spec is dropped as a whole (undefined).
export function applyAllowlist(value: unknown, spec: Spec): { value: unknown; dropped: number } {
  if (spec === true) return isScalar(value) ? { value, dropped: 0 } : { value: undefined, dropped: 1 };
  if (Array.isArray(spec)) {
    if (!Array.isArray(value)) return value === null ? { value: null, dropped: 0 } : { value: undefined, dropped: 1 };
    let dropped = 0;
    const out: unknown[] = [];
    for (const item of value) {
      const r = applyAllowlist(item, spec[0] as Spec);
      dropped += r.dropped;
      if (r.value !== undefined) out.push(r.value);
    }
    return { value: out, dropped };
  }
  if (!isPlainObject(value)) return value === null ? { value: null, dropped: 0 } : { value: undefined, dropped: 1 };
  const objSpec = spec as { readonly [key: string]: Spec };
  let dropped = 0;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (!Object.hasOwn(objSpec, k)) { dropped += 1; continue; }
    const r = applyAllowlist(v, objSpec[k]!);
    dropped += r.dropped;
    if (r.value !== undefined) out[k] = r.value;
  }
  return { value: out, dropped };
}

export type AuditRecordRow = { id: string; run_id: string; created_at: string; final_hash: string; snapshot: unknown };
export type Integrity = { seq: number | null; hash_ok: boolean; chain_ok: boolean } | null;

export const EXPORT_FORMAT = "ei-audit-export-v1";

export function buildAuditExport(record: AuditRecordRow, integrity: Integrity, exportedAt: string, contractExport: unknown = null) {
  const snap = applyAllowlist(record.snapshot, AUDIT_SNAPSHOT_ALLOWLIST);
  return {
    format: EXPORT_FORMAT,
    exported_at: exportedAt,
    record: { id: record.id, run_id: record.run_id, created_at: record.created_at, final_hash: record.final_hash },
    // Checked by the database on the stored snapshot (audit_integrity). null = not available.
    integrity: integrity ? { seq: integrity.seq, hash_ok: integrity.hash_ok, chain_ok: integrity.chain_ok } : null,
    // final_hash covers the stored snapshot. Fields outside the allowlist are
    // never exported; only their count is reported.
    dropped_field_count: snap.dropped,
    // The engine contract's own audit export (buildAuditExport: AUDIT_FIELDS +
    // finalAuditHash), built from the allowlisted snapshot. null = not available.
    contract_export: contractExport,
    snapshot: snap.value ?? null,
  };
}
