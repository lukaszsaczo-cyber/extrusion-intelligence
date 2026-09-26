import "server-only";
// The verified public contract (server/engine-contract) is the only integration boundary.
import { createAdapter } from "./engine-contract/src/adapter";
import { createGuard } from "./engine-contract/src/term-guard";
import { compare as contractCompare } from "./engine-contract/src/sanitizer";
import { METRICS } from "./engine-contract/src/contract";
import type { CompareFn } from "@/lib/verification/checks";
import type { PreflightResult, VerificationResult } from "@/lib/engine/results";

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

// URL and token configured (the adapter's own notion of "connected").
export function engineConfigured(): boolean {
  return engine().connected === true;
}

type AdapterResult<T> = { ok: true; result: T } | { ok: false; error: { errorId: string } };

// Sanitized by the contract; raw engine output never leaves the adapter.
export async function analyzePreflight(request: unknown): Promise<AdapterResult<PreflightResult>> {
  return (await engine().analyzePreflight(request)) as AdapterResult<PreflightResult>;
}

export async function verifyRun(runId: string): Promise<AdapterResult<VerificationResult>> {
  return (await engine().verifyRun(runId)) as AdapterResult<VerificationResult>;
}

// Opens only record_engine_decision / record_engine_verification (0015).
export function engineWriteKey(): string | null {
  const k = process.env.ENGINE_WRITE_KEY;
  return k && k.length >= 32 ? k : null;
}

export async function getEngineHealth(): Promise<EngineHealth> {
  const h = (await engine().getEngineHealth()) as { connected?: unknown };
  return { connected: h.connected === true };
}
