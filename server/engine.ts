import "server-only";
// The verified public contract (server/engine-contract) is the only integration boundary.
import { createAdapter } from "./engine-contract/src/adapter";
import { createGuard } from "./engine-contract/src/term-guard";
import { compare as contractCompare } from "./engine-contract/src/sanitizer";
import { METRICS } from "./engine-contract/src/contract";
import type { CompareFn } from "@/lib/verification/checks";

// Predicted vs actual uses the contract's own comparison and metric units.
export const compareWithContract: CompareFn = contractCompare as CompareFn;
export const METRIC_UNITS: Readonly<Record<string, string>> = METRICS as Record<string, string>;

export type EngineHealth = { connected: boolean };

function engine() {
  // Digests are not deployed yet: guard runs fail-closed (free-text codes dropped).
  const guard = createGuard({ key: process.env.TERM_GUARD_KEY, digests: [] });
  // adapter.js is plain JS: its inferred options type omits `guard` (no default), so pass a
  // non-literal object to skip the excess-property check without editing the contract.
  const options = { env: process.env, guard };
  return createAdapter(options);
}

export async function getEngineHealth(): Promise<EngineHealth> {
  const h = (await engine().getEngineHealth()) as { connected?: unknown };
  return { connected: h.connected === true };
}
