import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getT } from "@/lib/i18n";
import { getSessionContext } from "@/server/context";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createMachineLimit } from "@/server/actions";
import { filesByRun, liveView, recordedState, type ImportedFile } from "@/lib/console/state";
import { sourceModes } from "@/lib/console/source";
import { PlugIcon } from "@/components/plug-icon";
import { DataTable, Empty, Field, FormGrid, Notice, PageHeader, Panel, Select, formErrorKey } from "@/components/ui";

type Machine = {
  id: string; manufacturer: string | null; model: string | null; variant: string | null; serial_number: string | null;
  identification_mode: string; detection_confidence: string; controller_version: string | null; software_version: string | null;
  screw_diameter_mm: number | null; l_d: number | null; drive_power_kw: number | null; configured_max_rpm: number | null;
  configured_max_pressure_bar: number | null; zone_count: number | null; site_id: string;
};
type Limit = { id: string; parameter: string; bound: string; value: number; unit: string; source: string; confirmed_at: string | null };
type Tag = { id: string; tag: string; signal: string | null; unit: string | null };
type Run = { id: string; run_code: string; status: string; started_at: string | null; ended_at: string | null };

export default async function MachineConsole({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ e?: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const errorKey = formErrorKey((await searchParams).e);
  const { t, locale } = await getT();
  const ctx = await getSessionContext();
  if (!ctx?.current) redirect("/dashboard");
  const orgId = ctx.current.organizationId;
  const supabase = await createSupabaseServer();

  const { data: machineData } = await supabase.from("machines")
    .select("id, manufacturer, model, variant, serial_number, identification_mode, detection_confidence, controller_version, software_version, screw_diameter_mm, l_d, drive_power_kw, configured_max_rpm, configured_max_pressure_bar, zone_count, site_id")
    .eq("id", id).eq("organization_id", orgId).maybeSingle();
  if (!machineData) notFound();
  const m = machineData as Machine;

  const [siteRes, limitsRes, tagsRes, runsRes] = await Promise.all([
    supabase.from("sites").select("name").eq("id", m.site_id).maybeSingle(),
    supabase.from("machine_confirmed_limits").select("id, parameter, bound, value, unit, source, confirmed_at")
      .eq("machine_id", id).order("parameter"),
    supabase.from("machine_sensor_tags").select("id, tag, signal, unit").eq("machine_id", id).order("tag"),
    supabase.from("runs").select("id, run_code, status, started_at, ended_at")
      .eq("machine_id", id).order("created_at", { ascending: false }).limit(50),
  ]);
  const limits = (limitsRes.data ?? []) as Limit[];
  const tags = (tagsRes.data ?? []) as Tag[];
  const runs = (runsRes.data ?? []) as Run[];
  const filesRes = runs.length
    ? await supabase.from("run_files").select("run_id, filename, created_at").in("run_id", runs.map((r) => r.id))
    : { data: [] as ImportedFile[] };
  const files = filesByRun((filesRes.data ?? []) as ImportedFile[]);

  const canEdit = ctx.current.role === "ADMIN" || ctx.current.role === "ENGINEER";
  const na = t("common.notAvailable");
  const v = (x: string | number | null | undefined) => <span className="num">{x ?? na}</span>;
  const fmt = new Intl.DateTimeFormat(locale === "pl" ? "pl-PL" : "en-GB", { dateStyle: "short", timeStyle: "short" });
  const date = (x: string | null) => <span className="num">{x ? fmt.format(new Date(x)) : na}</span>;
  const title = [m.manufacturer, m.model, m.serial_number].filter(Boolean).join(" ") || m.id.slice(0, 8);
  const live = liveView();
  const state = recordedState(runs);
  const kv = (rows: [string, React.ReactNode][]) => (
    <dl className="grid gap-x-6 gap-y-2 px-4 py-4 text-sm sm:grid-cols-2">
      {rows.map(([k, val]) => (
        <div key={k} className="flex justify-between gap-4 border-b border-line pb-1">
          <dt className="text-muted">{k}</dt><dd>{val}</dd>
        </div>
      ))}
    </dl>
  );

  return (
    <div className="space-y-6">
      <PageHeader title={`${t("console.title")}: ${title}`}>
        <a href="#source" className="flex items-center gap-2 rounded bg-teal px-3 py-2 text-sm font-medium text-ground"><PlugIcon />{t("source.title")}</a>
        <Link href="/machine-console" className="rounded border border-line px-3 py-2 text-sm">{t("console.back")}</Link>
      </PageHeader>

      <section id="source" className="scroll-mt-4 rounded-md border border-line bg-panel">
        <h2 className="flex items-center gap-2 border-b border-line px-4 py-3 text-sm font-medium"><PlugIcon />{t("source.title")}</h2>
        <div className="grid gap-4 p-4 md:grid-cols-2">
          <div className="rounded border border-teal/60 p-4">
            <p className="flex items-center justify-between gap-2 text-sm font-medium">
              {t("source.manual")}<span className="text-teal">● {t("source.available")}</span>
            </p>
            <p className="mt-1 text-sm text-muted">{t("source.manualHint")}</p>
            {runs.length === 0 ? (
              <p className="mt-3 text-sm">{t("source.noRun")} <Link href="/runs" className="text-teal hover:underline">{t("source.createRun")}</Link></p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {runs.slice(0, 5).map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="num mr-auto">{r.run_code} <span className="text-muted">· {t(`runStatus.${r.status}`)}</span></span>
                    <Link href={`/runs/${r.id}/import`} className="text-teal hover:underline">{t("source.importCsv")}</Link>
                    <Link href={`/runs/${r.id}`} className="text-teal hover:underline">{t("source.manualEntry")}</Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded border border-line p-4">
            <p className="flex items-center justify-between gap-2 text-sm font-medium">
              {t("source.auto")}<span className="text-unknown">○ {t("source.notConnected")}</span>
            </p>
            <p className="mt-1 text-sm text-muted">{t("source.autoHint")}</p>
            {(() => { const auto = sourceModes()[1]; return auto.available ? null : (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
                {auto.requires.map((r) => <li key={r}>{t(`source.req.${r}`)}</li>)}
              </ul>
            ); })()}
            <button type="button" disabled className="mt-3 cursor-not-allowed rounded border border-line px-3 py-2 text-sm text-muted opacity-70">
              {t("source.connectAuto")}
            </button>
            <p className="mt-2 text-xs text-muted">{t("source.readOnly")}</p>
          </div>
        </div>
      </section>

      <Panel title={t("console.live")}>
        <p className="px-4 pt-4 text-lg font-medium text-unknown">{t("common.notAvailable")}</p>
        <Notice text={t(`console.liveReason.${live.reason}`)} />
      </Panel>

      <Panel title={t("console.state")}>
        <p className="px-4 pt-4 text-sm">{t(`console.recorded.${state}`)}</p>
        <Notice text={t("console.stateNote")} />
      </Panel>

      <Panel title={t("console.configuration")}>
        {kv([
          [t("machines.site"), (siteRes.data as { name: string } | null)?.name ?? na],
          [t("machines.manufacturer"), m.manufacturer ?? na],
          [t("machines.model"), m.model ?? na],
          [t("machines.variant"), m.variant ?? na],
          [t("machines.serial"), m.serial_number ?? na],
          [t("console.controller"), m.controller_version ?? na],
          [t("console.software"), m.software_version ?? na],
          [t("console.identification"), t(`console.idMode.${m.identification_mode}`)],
          [t("console.confidence"), t(`console.conf.${m.detection_confidence}`)],
        ])}
      </Panel>

      <Panel title={t("console.parameters")}>
        {kv([
          [t("machines.screwDiameter"), v(m.screw_diameter_mm)],
          [t("machines.ld"), v(m.l_d)],
          [t("machines.power"), v(m.drive_power_kw)],
          [t("machines.maxRpm"), v(m.configured_max_rpm)],
          [t("machines.maxPressure"), v(m.configured_max_pressure_bar)],
          [t("machines.zones"), v(m.zone_count)],
        ])}
      </Panel>

      <Panel title={t("console.limits")}>
        {errorKey && <Notice tone="stop" text={t(errorKey)} />}
        {limits.length === 0 ? <Empty text={t("console.noLimits")} /> : (
          <DataTable head={[t("console.parameter"), t("console.bound"), t("console.value"), t("console.unit"), t("console.source"), t("console.confirmedAt")]}
            rows={limits.map((l) => [l.parameter, t(`console.boundValue.${l.bound}`), v(l.value), l.unit,
              t(`console.sourceValue.${l.source}`), date(l.confirmed_at)])} />
        )}
        {canEdit ? (
          <FormGrid action={createMachineLimit} submit={t("form.add")}>
            <input type="hidden" name="machine_id" value={m.id} />
            <Field label={t("console.parameter")} name="parameter" required maxLength={64} />
            <Select label={t("console.bound")} name="bound" required
              options={[{ value: "MIN", label: t("console.boundValue.MIN") }, { value: "MAX", label: t("console.boundValue.MAX") }]} />
            <Field label={t("console.value")} name="value" type="number" step="any" required />
            <Field label={t("console.unit")} name="unit" required maxLength={32} />
            <Select label={t("console.source")} name="source" required
              options={[{ value: "CATALOG", label: t("console.sourceValue.CATALOG") },
                { value: "CONFIRMED_ON_MACHINE", label: t("console.sourceValue.CONFIRMED_ON_MACHINE") }]} />
          </FormGrid>
        ) : <Notice text={t("form.readOnly")} />}
      </Panel>

      <Panel title={t("tags.title")}>
        {tags.length === 0 ? <Empty text={t("console.noTags")} /> : (
          <DataTable head={[t("console.tag"), t("console.signal"), t("console.unit")]}
            rows={tags.map((g) => [<span key="t" className="num">{g.tag}</span>, g.signal ?? na, g.unit ?? na])} />
        )}
      </Panel>

      <Panel title={t("console.history")}>
        <Notice text={t("console.historyNote")} />
        {runs.length === 0 ? <Empty text={t("console.noRuns")} /> : (
          <DataTable head={[t("runs.code"), t("runs.status"), t("runs.start"), t("runs.end"), t("console.dataFiles")]}
            rows={runs.map((r) => [
              <span key="c" className="num">{r.run_code}</span>, t(`runStatus.${r.status}`), date(r.started_at), date(r.ended_at),
              (files.get(r.id) ?? []).length === 0 ? t("console.noFiles") : (
                <ul key="f" className="space-y-1">
                  {(files.get(r.id) ?? []).map((f) => (
                    <li key={f.filename + f.created_at}>
                      <span className="num">{f.filename}</span>
                      <span className="text-muted"> · {t("console.importedAt")} </span>{date(f.created_at)}
                    </li>
                  ))}
                </ul>
              ),
            ])} />
        )}
      </Panel>
    </div>
  );
}
