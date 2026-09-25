// Machine Console state rules. V1 has no live telemetry: nothing here may be
// presented as a live reading, and imported CSV run data is history only.

export type LiveView = { available: false; reason: "NO_LIVE_SOURCE" };

// There is no live machine data source in V1, so the live view is always
// unavailable. A future live source must replace this function explicitly.
export function liveView(): LiveView {
  return { available: false, reason: "NO_LIVE_SOURCE" };
}

// What the app knows about the machine's state comes only from recorded runs.
// RECORDED_RUNNING means a run record has status RUNNING; it is not a reading
// from the machine.
export type RecordedState = "NO_RUNS" | "RECORDED_RUNNING" | "NO_RECORDED_RUNNING";

export function recordedState(runs: ReadonlyArray<{ status: string }>): RecordedState {
  if (runs.length === 0) return "NO_RUNS";
  return runs.some((r) => r.status === "RUNNING") ? "RECORDED_RUNNING" : "NO_RECORDED_RUNNING";
}

export type ImportedFile = { run_id: string; filename: string; created_at: string };

// Groups imported files by run so history can show where each run's data came
// from (file name and import time), never as live data.
export function filesByRun(files: ReadonlyArray<ImportedFile>): Map<string, ImportedFile[]> {
  const out = new Map<string, ImportedFile[]>();
  for (const f of [...files].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    out.set(f.run_id, [...(out.get(f.run_id) ?? []), f]);
  }
  return out;
}
