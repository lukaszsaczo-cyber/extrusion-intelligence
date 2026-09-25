import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getT } from "@/lib/i18n";
import { getSessionContext } from "@/server/context";
import { createSupabaseServer } from "@/lib/supabase/server";
import { runQualityCheck } from "@/server/quality";
import { DataTable, Empty, Notice, PageHeader, Panel } from "@/components/ui";

const ERRORS = ["forbidden", "failed", "empty", "tooLarge"];
const SAMPLE_REASONS = ["SOURCE_FLAGGED", "TIMESTAMP_DUPLICATE", "PHYSICALLY_IMPOSSIBLE", "SPIKE", "FLATLINE"];
type SignalRow = { signal: string; verdict: string; reasons: string[]; valid_samples: number; quarantined_samples: number };

const tone = (v: string) => (v === "VALID" ? "text-teal" : v === "QUARANTINED" ? "text-caution" : "text-stop");

export default async function QualityPage({ params, searchParams }: {
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

  const [assessmentsRes, metricsRes] = await Promise.all([
    supabase.from("quality_assessments").select("id, ruleset_version, verdict, created_at")
      .eq("run_id", run.id).order("created_at", { ascending: false }).limit(10),
    supabase.from("run_metrics").select("id", { count: "exact", head: true }).eq("run_id", run.id),
  ]);
  const assessments = (assessmentsRes.data ?? []) as { id: string; ruleset_version: string; verdict: string; created_at: string }[];
  const latest = assessments[0];

  let signals: SignalRow[] = [];
  let byReason: [string, number][] = [];
  if (latest) {
    // Exact counts per reason (a plain select would be capped at 1000 rows).
    const [sigRes, ...countRes] = await Promise.all([
      supabase.from("quality_signal_results").select("signal, verdict, reasons, valid_samples, quarantined_samples")
        .eq("assessment_id", latest.id).order("signal"),
      ...SAMPLE_REASONS.map((r) => supabase.from("quality_quarantined_metrics")
        .select("id", { count: "exact", head: true }).eq("assessment_id", latest.id).eq("reason", r)),
    ]);
    signals = (sigRes.data ?? []) as SignalRow[];
    byReason = SAMPLE_REASONS.map((r, i) => [r, countRes[i]?.count ?? 0] as [string, number])
      .filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  }

  const canRun = ctx.current.role === "ADMIN" || ctx.current.role === "ENGINEER";
  const fmt = new Intl.DateTimeFormat(locale === "pl" ? "pl-PL" : "en-GB", { dateStyle: "short", timeStyle: "short" });
  const verdict = (v: string) => <span className={tone(v)}>{t(`quality.verdict.${v}`)}</span>;
  const reason = (r: string) => t(`quality.reason.${r}`);

  return (
    <div className="space-y-6">
      <PageHeader title={t("quality.title")}>
        <Link href="/runs" className="rounded border border-line px-3 py-2 text-sm">{t("import.back")}</Link>
      </PageHeader>
      <p className="text-sm">
        <span className="text-muted">{t("import.run")}: </span><span className="num">{run.run_code}</span>
        <span className="ml-6 text-muted">{t("quality.samples")}: </span><span className="num">{metricsRes.count ?? 0}</span>
      </p>
      <p className="text-sm text-muted">{t("quality.intro")}</p>

      <Panel title={t("quality.run")}>
        {e && ERRORS.includes(e) && <Notice tone="stop" text={t(`quality.err.${e}`)} />}
        {canRun ? (
          <form action={runQualityCheck} className="px-4 py-4">
            <input type="hidden" name="run_id" value={run.id} />
            <button className="rounded bg-teal px-3 py-2 text-sm font-medium text-ground">{t("quality.runButton")}</button>
            <p className="mt-2 text-sm text-muted">{t("quality.uncalibrated")}</p>
          </form>
        ) : <Notice text={t("quality.readOnly")} />}
      </Panel>

      <Panel title={t("quality.latest")}>
        {!latest ? <Empty text={t("quality.none")} /> : (
          <div className="space-y-4 pb-4">
            <p className="px-4 pt-4 text-sm">
              {t("quality.verdictLabel")}: {verdict(latest.verdict)}
              <span className="ml-6 text-muted">{t("quality.ruleset")}: </span><span className="num">{latest.ruleset_version}</span>
              <span className="ml-6 text-muted">{t("quality.at")}: </span><span className="num">{fmt.format(new Date(latest.created_at))}</span>
            </p>
            <DataTable
              head={[t("quality.signal"), t("quality.verdictLabel"), t("quality.reasons"), t("quality.valid"), t("quality.quarantined")]}
              rows={signals.map((s) => [
                <span key="s" className="num">{s.signal}</span>, verdict(s.verdict),
                s.reasons.length ? s.reasons.map(reason).join(", ") : "—",
                <span key="v" className="num">{s.valid_samples}</span>, <span key="q" className="num">{s.quarantined_samples}</span>,
              ])}
            />
            {byReason.length > 0 && (
              <p className="px-4 text-sm">
                <span className="text-muted">{t("quality.byReason")}: </span>
                {byReason.map(([r, n]) => `${reason(r)} ${n}`).join(" · ")}
              </p>
            )}
          </div>
        )}
      </Panel>

      {assessments.length > 1 && (
        <Panel title={t("quality.history")}>
          <DataTable head={[t("quality.at"), t("quality.ruleset"), t("quality.verdictLabel")]}
            rows={assessments.slice(1).map((a) => [
              <span key="d" className="num">{fmt.format(new Date(a.created_at))}</span>,
              <span key="r" className="num">{a.ruleset_version}</span>, verdict(a.verdict),
            ])} />
        </Panel>
      )}
    </div>
  );
}
