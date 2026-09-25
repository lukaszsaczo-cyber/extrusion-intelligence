import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getT } from "@/lib/i18n";
import { getSessionContext } from "@/server/context";
import { createSupabaseServer } from "@/lib/supabase/server";
import { DataTable, Empty, Notice, PageHeader, Panel } from "@/components/ui";
import { ImportForm } from "@/components/import-form";

const LABEL_KEYS = [
  "fileHint", "file", "delimiter", "delimiterComma", "delimiterSemicolon", "delimiterTab", "decimal", "decimalDot",
  "decimalComma", "tsColumn", "tsFormat", "tsIso", "tsEpochS", "tsEpochMs", "sampling", "samplingHint", "interval",
  "resolution", "tsSource", "missingPolicy", "timezone", "unknown", "acceptUnmapped", "submit", "submitting", "ok",
  "range", "unmappedStored", "unmappedBlock", "nothingSaved",
  ...["PLC", "HISTORIAN", "IMPORT_FILE", "MANUAL"].map((v) => `source.${v}`),
  ...["NOT_FILLED", "MARKED_MISSING", "FORWARD_FILLED", "INTERPOLATED"].map((v) => `policy.${v}`),
  ...["VALID", "SUSPECT", "MISSING", "UNMAPPED"].map((v) => `quality.${v}`),
  ...["invalid", "forbidden", "failed", "tooLarge", "empty", "duplicate", "samplingConflict", "notFound"].map((v) => `err.${v}`),
  ...["BOTH_COMMA", "NO_DATA_ROWS", "EMPTY_HEADER", "DUPLICATE_HEADER", "TS_COLUMN_MISSING", "NO_DATA_COLUMNS",
    "TOO_MANY_VALUES", "FIELD_COUNT", "BAD_TIMESTAMP", "TOO_MANY_ERRORS"].map((v) => `parse.${v}`),
];

type FileRow = { id: string; filename: string; sha256: string; row_count: number | null; column_count: number | null; created_at: string };
type TagRow = { tag: string; signal: string | null; unit: string | null };

export default async function ImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { t, locale } = await getT();
  const ctx = await getSessionContext();
  if (!ctx?.current) redirect("/dashboard");
  const orgId = ctx.current.organizationId;

  const supabase = await createSupabaseServer();
  const { data: run } = await supabase.from("runs").select("id, run_code, machine_id")
    .eq("id", id).eq("organization_id", orgId).maybeSingle();
  if (!run) notFound();

  const [machineRes, filesRes, samplingRes, tagsRes] = await Promise.all([
    supabase.from("machines").select("manufacturer, model, serial_number").eq("id", run.machine_id).maybeSingle(),
    supabase.from("run_files").select("id, filename, sha256, row_count, column_count, created_at")
      .eq("run_id", run.id).order("created_at", { ascending: false }),
    supabase.from("run_sampling").select("id").eq("run_id", run.id).maybeSingle(),
    supabase.from("machine_sensor_tags").select("tag, signal, unit").eq("machine_id", run.machine_id).order("tag"),
  ]);
  const m = machineRes.data;
  const machineName = m ? [m.manufacturer, m.model, m.serial_number].filter(Boolean).join(" ") || run.machine_id.slice(0, 8) : "";
  const files = (filesRes.data ?? []) as FileRow[];
  const tags = ((tagsRes.data ?? []) as TagRow[]).filter((tg) => tg.signal);
  const canImport = ctx.current.role !== "VIEWER";
  const fmt = new Intl.DateTimeFormat(locale === "pl" ? "pl-PL" : "en-GB", { dateStyle: "short", timeStyle: "short" });
  const na = t("common.notAvailable");

  const labels: Record<string, string> = Object.fromEntries(LABEL_KEYS.map((k) => [k, t(`import.${k}`)]));
  if (samplingRes.data) labels.samplingRecorded = t("import.samplingRecorded");

  return (
    <div className="space-y-6">
      <PageHeader title={t("import.title")}>
        <Link href="/runs" className="rounded border border-line px-3 py-2 text-sm">{t("import.back")}</Link>
      </PageHeader>
      <p className="text-sm">
        <span className="text-muted">{t("import.run")}: </span><span className="num">{run.run_code}</span>
        <span className="ml-6 text-muted">{t("import.machine")}: </span>{machineName || na}
      </p>

      <Panel title={t("import.tags")}>
        <Notice text={t("import.tagsHint")} />
        {tags.length === 0 ? <Notice tone="stop" text={t("import.noTags")} /> : (
          <DataTable head={[t("tags.tag"), t("tags.signal"), t("tags.unit")]}
            rows={tags.map((tg) => [<span key="t" className="num">{tg.tag}</span>, tg.signal, tg.unit ?? na])} />
        )}
      </Panel>

      <Panel title={t("import.form")}>
        {canImport ? <ImportForm runId={run.id} labels={labels} locale={locale} /> : <Notice text={t("form.readOnly")} />}
      </Panel>

      <Panel title={t("import.files")}>
        {files.length === 0 ? <Empty text={t("import.noFiles")} /> : (
          <DataTable
            head={[t("import.filename"), t("import.rows"), t("import.columns"), t("import.sha"), t("import.importedAt")]}
            rows={files.map((f) => [
              f.filename, <span key="r" className="num">{f.row_count ?? na}</span>,
              <span key="c" className="num">{f.column_count ?? na}</span>,
              <span key="s" className="num" title={f.sha256}>{f.sha256.slice(0, 12)}…</span>,
              <span key="d" className="num">{fmt.format(new Date(f.created_at))}</span>,
            ])}
          />
        )}
      </Panel>
    </div>
  );
}
