import "server-only";
// The verified public contract (server/engine-contract) is the only integration boundary.
import { createAdapter } from "./engine-contract/src/adapter";
import { createGuard } from "./engine-contract/src/term-guard";

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
