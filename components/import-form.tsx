"use client";
import { useActionState } from "react";
import { importRunFile, type ImportState } from "@/server/import";

// Labels are resolved on the server (keys under "import.*") and passed in flat.
type Labels = Record<string, string>;

const fill = (template: string, params: Record<string, string | number> = {}) =>
  template.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`));

const input = "w-full rounded border border-line bg-ground px-3 py-2 text-sm outline-none focus:border-teal";

function Choice({ label, name, options, defaultValue }: {
  label: string; name: string; options: [string, string][]; defaultValue?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-muted">{label}</span>
      <select name={name} defaultValue={defaultValue} className={input}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

export function ImportForm({ runId, labels: l, locale }: { runId: string; labels: Labels; locale: string }) {
  const L = (key: string) => l[key] ?? key;
  const [state, action, pending] = useActionState<ImportState, FormData>(importRunFile, { status: "idle" });
  const fmt = new Intl.DateTimeFormat(locale === "pl" ? "pl-PL" : "en-GB", { dateStyle: "short", timeStyle: "medium" });

  return (
    <form action={action} className="space-y-4 px-4 py-4">
      <input type="hidden" name="run_id" value={runId} />
      <p className="text-sm text-muted">{L("fileHint")}</p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block text-sm">
          <span className="mb-1 block text-muted">{L("file")}</span>
          <input name="file" type="file" required accept=".csv,.txt,.tsv,text/csv,text/plain" className={input} />
        </label>
        <Choice label={L("delimiter")} name="delimiter"
          options={[["comma", L("delimiterComma")], ["semicolon", L("delimiterSemicolon")], ["tab", L("delimiterTab")]]} />
        <Choice label={L("decimal")} name="decimal" options={[["dot", L("decimalDot")], ["comma", L("decimalComma")]]} />
        <label className="block text-sm">
          <span className="mb-1 block text-muted">{L("tsColumn")}</span>
          <input name="timestamp_column" required maxLength={200} className={input} />
        </label>
        <Choice label={L("tsFormat")} name="timestamp_format"
          options={[["iso_offset", L("tsIso")], ["epoch_s", L("tsEpochS")], ["epoch_ms", L("tsEpochMs")]]} />
      </div>

      <fieldset className="rounded border border-line p-3">
        <legend className="px-1 text-sm font-medium">{L("sampling")}</legend>
        <p className="mb-3 text-sm text-muted">{L("samplingHint")}</p>
        {l.samplingRecorded && <p className="mb-3 text-sm text-caution">{L("samplingRecorded")}</p>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block text-sm">
            <span className="mb-1 block text-muted">{L("interval")}</span>
            <input name="sampling_interval_ms" type="number" min={1} step={1} className={input} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">{L("resolution")}</span>
            <input name="timestamp_resolution_ms" type="number" min={1} step={1} className={input} />
          </label>
          <Choice label={L("tsSource")} name="timestamp_source" defaultValue=""
            options={[["", L("unknown")], ...["PLC", "HISTORIAN", "IMPORT_FILE", "MANUAL"].map((v) => [v, L(`source.${v}`)] as [string, string])]} />
          <Choice label={L("missingPolicy")} name="missing_sample_policy" defaultValue=""
            options={[["", L("unknown")], ...["NOT_FILLED", "MARKED_MISSING", "FORWARD_FILLED", "INTERPOLATED"].map((v) => [v, L(`policy.${v}`)] as [string, string])]} />
          <label className="block text-sm">
            <span className="mb-1 block text-muted">{L("timezone")}</span>
            <input name="source_timezone" maxLength={64} placeholder="Europe/Warsaw" className={input} />
          </label>
        </div>
      </fieldset>

      <label className="flex items-start gap-2 text-sm">
        <input name="accept_unmapped" type="checkbox" className="mt-1" />
        <span>{L("acceptUnmapped")}</span>
      </label>

      <button disabled={pending} className="rounded bg-teal px-3 py-2 text-sm font-medium text-ground disabled:opacity-60">
        {pending ? L("submitting") : L("submit")}
      </button>

      <div role="status" aria-live="polite" className="text-sm">
        {state.status === "error" && <p className="text-stop">{L(`err.${state.code}`)}</p>}
        {state.status === "parseError" && (
          <div className="text-stop">
            <p>{L("nothingSaved")}</p>
            <ul className="mt-1 list-disc pl-5">
              {state.errors.map((e, i) => <li key={i}>{fill(L(`parse.${e.code}`), e.params)}</li>)}
            </ul>
          </div>
        )}
        {state.status === "unmapped" && (
          <p className="text-caution">{fill(L("unmappedBlock"), { columns: state.columns.join(", ") })} {L("nothingSaved")}</p>
        )}
        {state.status === "ok" && (
          <div className="space-y-1">
            <p className="text-teal">{fill(L("ok"), { rows: state.rows, columns: state.columns, file: state.filename })}</p>
            <p className="text-muted">{fill(L("range"), { first: fmt.format(new Date(state.firstTs)), last: fmt.format(new Date(state.lastTs)) })}</p>
            <p className="num">
              {(["VALID", "SUSPECT", "MISSING", "UNMAPPED"] as const).map((q) => `${L(`quality.${q}`)}: ${state.counts[q]}`).join(" · ")}
            </p>
            {state.unmapped.length > 0 && (
              <p className="text-caution">{fill(L("unmappedStored"), { columns: state.unmapped.join(", ") })}</p>
            )}
          </div>
        )}
      </div>
    </form>
  );
}
