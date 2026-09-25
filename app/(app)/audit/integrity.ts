export type IntegrityRow = { id: string; seq: number | null; hash_ok: boolean; chain_ok: boolean };
export type IntegrityState = "INTACT" | "HASH_MISMATCH" | "CHAIN_BROKEN" | "NOT_AVAILABLE";

// A record is INTACT only when the database confirms both its own hash and its
// link to the previous record. No integrity row means the check did not run.
export function integrityState(row: IntegrityRow | undefined): IntegrityState {
  if (!row) return "NOT_AVAILABLE";
  if (!row.hash_ok) return "HASH_MISMATCH";
  if (!row.chain_ok) return "CHAIN_BROKEN";
  return "INTACT";
}
