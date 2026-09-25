import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getT } from "@/lib/i18n";
import { getSessionContext } from "@/server/context";
import { createSupabaseServer } from "@/lib/supabase/server";
import { refreshState, runDiagnosis } from "@/server/diagnosis";
import { DataTable, Empty, Notice, PageHeader, Panel } from "@/components/ui";
import type { Snapshot } from "@/lib/diagnosis/snapshot";
import type { Gate } from "@/lib/diagnosis/gates";

const ERRORS = ["forbidden", "failed", "tooLarge", "noQuality", "noSnapshot"];
const statusTone = (s: string) => (s === "PASS" || s === "DIAGNOSED" ? "text-teal" : s === "UNKNOWN" || s === "INCONCLUSIVE" ? "text-caution" : "text-stop");

export default async function DiagnosisPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ e?: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { e } = await searchParams;
  const { t, locale } = await getT();
  const ctx = await getSessionContext();
  if (!ctx?.current) redirect("/dashboard");

  const supabase = await createSupabaseServer();
  const { data: run } = await supabase.from("runs").select("id, run_code")
    .eq("id", id).eq("organization_id", ctx.current.organizationId).maybeSingle();
  if (!run) notFound();

  const [snapRes, diagRes] = await Promise.all([
    supabase.from("state_snapshots").select("id, snapshot, sha256, created_at")
      .eq("run_id", run.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("diagnoses").select("id, snapshot_id, status, gates, gates_version, created_at")
      .eq("run_id", run.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const snap = snapRes.data as { id: string; snapshot: Snapshot; sha256: string; created_at: string } | null;
  const diag = diagRes.data as { id: string; snapshot_id: string; status: string; gates: Gate[]; gates_version: string; created_at: string } | null;

  const canRun = ctx.current.role === "ADMIN" || ctx.current.role === "ENGINEER";
  const fmt = new Intl.DateTimeFormat(locale === "pl" ? "pl-PL" : "en-GB", { dateStyle: "short", timeStyle: "short" });
  const na = t("common.notAvailable");
  const n = (v: number | null) => <span className="num">{v ?? na}</span>;
  const s = snap?.snapshot;

  return (
    <div className="space-y-6">
      <PageHeader title={t("diagnosis.title")}>
        <Link href={`/runs/${run.id}/quality`} className="rounded border border-line px-3 py-2 text-sm">{t("quality.action")}</Link>
        <Link href="/runs" className="rounded border border-line px-3 py-2 text-sm">{t("import.back")}</Link>
      </PageHeader>
      <p className="text-sm">
        <span className="text-muted">{t("import.run")}: </span><span className="num">{run.run_code}</span>
      </p>
      <p className="text-sm text-muted">{t("diagnosis.intro")}</p>
      {e && ERRORS.includes(e) && <p className="text-sm text-stop">{t(`diagnosis.err.${e}`)}</p>}

      <Panel title={t("diagnosis.refreshTitle")}>
        <Notice text={t("diagnosis.refreshHint")} />
        {canRun ? (
          <form action={refreshState} className="px-4 pb-4">
            <input type="hidden" name="run_id" value={run.id} />
            <button className="rounded bg-teal px-3 py-2 text-sm font-medium text-ground">{t("diagnosis.refreshButton")}</button>
          </form>
        ) : <Notice text={t("diagnosis.readOnly")} />}
        {!s ? <Empty text={t("diagnosis.noSnapshot")} /> : (
          <div className="space-y-3 pb-4">
            <p className="px-4 text-sm">
              <span className="text-muted">{t("diagnosis.at")}: </span><span className="num">{fmt.format(new Date(snap!.created_at))}</span>
              <span className="ml-6 text-muted">{t("quality.verdictLabel")}: </span>{t(`quality.verdict.${s.quality.verdict}`)}
              <span className="ml-6 text-muted">SHA-256: </span><span className="num" title={snap!.sha256}>{snap!.sha256.slice(0, 16)}…</span>
            </p>
            <p className="px-4 text-sm text-muted">
              {t("diagnosis.totals")}: <span className="num">{s.totals.cleanSamples} / {s.totals.samples}</span>
              {s.unmappedTags.length > 0 && <> · {t("diagnosis.unmapped")}: <span className="num">{s.unmappedTags.join(", ")}</span></>}
            </p>
            {s.signals.length > 0 && (
              <DataTable
                head={[t("diagnosis.signal"), t("diagnosis.n"), "min", "max", t("diagnosis.mean"), t("diagnosis.median"),
                  t("diagnosis.std"), t("diagnosis.limits"), t("diagnosis.outside")]}
                rows={s.signals.map((x) => [
                  <span key="s" className="num">{x.code}{x.unit ? ` [${x.unit}]` : ""}</span>, n(x.n), n(x.min), n(x.max), n(x.mean),
                  n(x.median), n(x.std),
                  <span key="l" className="num">{x.limitMin ?? "—"} … {x.limitMax ?? "—"}</span>,
                  <span key="o" className="num">
                    {x.samplesBelowMin === null && x.samplesAboveMax === null ? "—"
                      : `${x.samplesBelowMin ?? "?"} / ${x.samplesAboveMax ?? "?"}`}
                  </span>,
                ])}
              />
            )}
          </div>
        )}
      </Panel>

      <Panel title={t("diagnosis.gatesTitle")}>
        <Notice text={t("diagnosis.gatesHint")} />
        {canRun && s && (
          <form action={runDiagnosis} className="px-4 pb-4">
            <input type="hidden" name="run_id" value={run.id} />
            <button className="rounded bg-teal px-3 py-2 text-sm font-medium text-ground">{t("diagnosis.runButton")}</button>
          </form>
        )}
        {!diag ? <Empty text={t("diagnosis.noDiagnosis")} /> : (
          <div className="space-y-3 pb-4">
            <p className="px-4 text-sm">
              {t("diagnosis.outcome")}: <span className={statusTone(diag.status)}>{t(`diagnosis.status.${diag.status}`)}</span>
              <span className="ml-6 text-muted">{t("diagnosis.at")}: </span><span className="num">{fmt.format(new Date(diag.created_at))}</span>
              <span className="ml-6 text-muted">{t("diagnosis.version")}: </span><span className="num">{diag.gates_version}</span>
              {snap && diag.snapshot_id !== snap.id && <span className="ml-6 text-caution">{t("diagnosis.stale")}</span>}
            </p>
            <DataTable head={[t("diagnosis.gate"), t("diagnosis.gateStatus"), t("diagnosis.gateReason")]}
              rows={diag.gates.map((g) => [
                t(`diagnosis.gate_${g.id}`),
                <span key="s" className={statusTone(g.status)}>{t(`diagnosis.gs_${g.status}`)}</span>,
                t(`diagnosis.gr_${g.reason}`),
              ])} />
          </div>
        )}
      </Panel>
    </div>
  );
}
