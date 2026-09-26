// Data source modes of a machine (docs/CANON.md: read-only, CSV first).
// MANUAL = CSV import and manual entry, always available. AUTO = a read-only
// gateway at the plant (OPC UA or the Fitsys+ historian export); it is
// available only when a live source exists, which V1 does not have.
// No mode ever sends anything to the machine.

export type SourceMode =
  | { mode: "MANUAL"; available: true }
  | { mode: "AUTO"; available: false; reason: "NO_GATEWAY"; requires: readonly AutoRequirement[] };

export type AutoRequirement = "GATEWAY_READ_ONLY" | "OPCUA_OR_HISTORIAN" | "TAG_LIST" | "CSV_CHAIN_PASSED";

export const AUTO_REQUIREMENTS: readonly AutoRequirement[] = ["GATEWAY_READ_ONLY", "OPCUA_OR_HISTORIAN", "TAG_LIST", "CSV_CHAIN_PASSED"];

export const WRITES_TO_MACHINE = false as const;

// V1 has no live source (state.ts liveView()); a future gateway must change this explicitly.
export function sourceModes(): [SourceMode, SourceMode] {
  return [
    { mode: "MANUAL", available: true },
    { mode: "AUTO", available: false, reason: "NO_GATEWAY", requires: AUTO_REQUIREMENTS },
  ];
}
