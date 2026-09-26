// Maps an allowlisted audit snapshot to the arguments of the engine contract's
// buildAuditExport(record, preflight, processVerification, productVerification,
// finalStatus). Only stored values, nothing inferred:
//   * audit-v1 snapshots lack organization/site/machine/recipe_version -> null;
//   * one imported file -> its name and hash as strings; several -> lists in
//     import order; none -> null;
//   * process / product / final use only verifications of kind PROCESS /
//     PRODUCT / FINAL (latest by verified_at). The engine's whole-run
//     verification (kind ENGINE) is not mapped to any of them: the contract
//     does not say which one it is. It stays in the app snapshot.
// Pure, no I/O.

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const list = (v: unknown): Obj[] => (Array.isArray(v) ? v.map(obj).filter((x): x is Obj => x !== null) : []);
const val = (o: Obj | null, k: string): unknown => (o && k in o ? o[k] ?? null : null);

export type ContractAuditArgs = {
  record: Record<string, unknown>;
  preflight: { status: string } | null;
  processVerification: { state: string } | null;
  productVerification: { state: string } | null;
  finalStatus: string | null;
};

function latestState(verifications: Obj[], kind: string): string | null {
  const own = verifications.filter((v) => v.kind === kind && typeof v.state === "string" && typeof v.verified_at === "string");
  own.sort((a, b) => String(a.verified_at).localeCompare(String(b.verified_at)));
  return own.length ? String(own[own.length - 1]!.state) : null;
}

export function toContractAuditArgs(auditId: string, snapshot: unknown): ContractAuditArgs {
  const s = obj(snapshot) ?? {};
  const run = obj(s.run), plan = obj(s.plan), org = obj(s.organization), site = obj(s.site), machine = obj(s.machine), rv = obj(s.recipe_version);
  const files = list(s.files);
  const one = files.length === 1;
  const machineLabel = machine ? [val(machine, "manufacturer"), val(machine, "model"), val(machine, "variant")].filter((x) => typeof x === "string" && x).join(" ") || null : null;
  const verifications = list(s.verifications);
  const process = latestState(verifications, "PROCESS");
  const product = latestState(verifications, "PRODUCT");
  const status = obj(val(plan, "decision"))?.status;
  return {
    record: {
      auditId,
      runId: val(run, "id"),
      organization: val(org, "name"),
      site: val(site, "name"),
      machine: machineLabel,
      serialNumber: val(machine, "serial_number"),
      machineConfigSnapshot: obj(val(machine, "configuration")),
      recipeVersion: rv ? { id: val(rv, "id"), recipe: val(rv, "recipe"), version: val(rv, "version"), status: val(rv, "status") } : null,
      processPlanVersion: plan ? { id: val(plan, "id"), version: val(plan, "version") } : null,
      operator: val(run, "operator_id"),
      startTime: val(run, "started_at"),
      endTime: val(run, "ended_at"),
      importedFilename: files.length === 0 ? null : one ? val(files[0]!, "filename") : files.map((f) => val(f, "filename")),
      fileHash: files.length === 0 ? null : one ? val(files[0]!, "sha256") : files.map((f) => val(f, "sha256")),
    },
    preflight: typeof status === "string" ? { status } : null,
    processVerification: process ? { state: process } : null,
    productVerification: product ? { state: product } : null,
    finalStatus: latestState(verifications, "FINAL"),
  };
}
