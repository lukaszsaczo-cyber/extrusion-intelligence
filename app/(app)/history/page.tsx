import Link from "next/link";
import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n";
import { getSessionContext } from "@/server/context";
import { peopleNames } from "@/server/people";
import { createSupabaseServer } from "@/lib/supabase/server";
import { buildChains, buildEvents, type HistoryInput, type Step } from "@/lib/history/timeline";
import { DataTable, Empty, Notice, PageHeader, Panel } from "@/components/ui";

const LIMIT = 200;

export default async function HistoryPage() {
  const { t, locale } = await getT();
  const ctx = await getSessionContext();
  if (!ctx?.current) redirect("/dashboard");
  const orgId = ctx.current.organizationId;
  const supabase = await createSupabaseServer();
  const [runs, plans, files, quality, diagnoses, measurements, verifications, audits, predictions] = await Promise.all([
    supabase.from("runs").select("id, run_code, status, process_plan_id, started_at, ended_at, created_at, created_by").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(LIMIT),
    supabase.from("process_plans").select("id, preflight_status, preflight_at, approved_by, approved_at, created_at, created_by").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(LIMIT),
    supabase.from("run_files").select("run_id, filename, created_at, created_by").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(LIMIT),
    supabase.from("quality_assessments").select("run_id, verdict, created_at, created_by").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(LIMIT),
    supabase.from("diagnoses").select("run_id, status, created_at, created_by").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(LIMIT),
    supabase.from("product_measurements").select("product_sample_id, parameter, created_at, created_by").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(LIMIT),
    supabase.from("verifications").select("run_id, kind, state, verified_at, created_at, created_by").eq("organization_id", orgId).order("verified_at", { ascending: false }).limit(LIMIT),
    supabase.from("audit_records").select("id, run_id, created_at, created_by").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(LIMIT),
    supabase.from("plan_predictions").select("process_plan_id, metric, created_at").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(LIMIT),
  ]);
  // measurements carry their run through the sample
  const sampleIds = [...new Set(((measurements.data ?? []) as { product_sample_id: string }[]).map((m) => m.product_sample_id))];
  const samples = sampleIds.length
    ? await supabase.from("product_samples").select("id, run_id").in("id", sampleIds)
    : { data: [] as { id: string; run_id: string }[] };
  const runOfSample = new Map(((samples.data ?? []) as { id: string; run_id: string }[]).map((x) => [x.id, x.run_id]));
  type MeasRow = { product_sample_id: string; parameter: string; created_at: string; created_by: string | null };
  const input: HistoryInput = {
    runs: (runs.data ?? []) as HistoryInput["runs"],
    plans: (plans.data ?? []) as HistoryInput["plans"],
    files: (files.data ?? []) as HistoryInput["files"],
    quality: (quality.data ?? []) as HistoryInput["quality"],
    diagnoses: (diagnoses.data ?? []) as HistoryInput["diagnoses"],
    measurements: ((measurements.data ?? []) as MeasRow[]).flatMap((m) => {
      const run_id = runOfSample.get(m.product_sample_id);
      return run_id ? [{ run_id, parameter: m.parameter, created_at: m.created_at, created_by: m.created_by }] : [];
    }),
    verifications: (verifications.data ?? []) as HistoryInput["verifications"],
    audits: (audits.data ?? []) as HistoryInput["audits"],
    predictions: (predictions.data ?? []) as HistoryInput["predictions"],
  };
  const chains = buildChains(input);
  const events = buildEvents(input).slice(0, LIMIT);
  const name = await peopleNames(supabase, events.map((e) => e.by));
  const runCode = new Map(input.runs.map((r) => [r.id, r.run_code]));

  const na = t("common.notAvailable");
  const fmt = new Intl.DateTimeFormat(locale === "pl" ? "pl-PL" : "en-GB", { dateStyle: "short", timeStyle: "short" });
  const step = (s: Step, label?: string | null) => s.state === "NOT_AVAILABLE"
    ? <span className="text-muted">{na}</span>
    : <span><span className="text-teal">{label ?? "✓"}</span>{s.at && <span className="num ml-1 text-muted">{fmt.format(new Date(s.at))}</span>}</span>;
  const runLink = (id: string | null) => id
    ? <Link key="r" href={`/runs/${id}`} className="underline decoration-line underline-offset-4">{runCode.get(id) ?? id.slice(0, 8)}</Link>
    : na;

  return (
    <div className="space-y-6">
      <PageHeader title={t("history.title")} />
      <Notice text={t("history.hint")} />

      <Panel title={t("history.chain")}>
        {chains.length === 0 ? <Empty text={t("history.noRuns")} /> : (
          <DataTable head={[t("runs.code"), t("history.decision"), t("history.approval"), t("history.run"), t("history.actual"), t("history.verification")]}
            rows={chains.map((c) => [
              runLink(c.run.id),
              step(c.decision, c.decision.label ? t(`dashboard.decision.${c.decision.label}`) : null),
              step(c.approval),
              step(c.run_step, c.run_step.label ? t(`runStatus.${c.run_step.label}`) : null),
              step(c.actual, c.actual.label ? `${c.actual.label} ${t("history.records")}` : null),
              step(c.verification, c.verification.label ? t(`dashboard.verificationState.${c.verification.label}`) : null),
            ])} />
        )}
      </Panel>

      <Panel title={t("history.events")}>
        {events.length === 0 ? <Empty text={t("history.noEvents")} /> : (
          <DataTable head={[t("history.time"), t("history.event"), t("runs.code"), t("history.detail"), t("history.user")]}
            rows={events.map((e) => [
              <span key="t" className="num">{fmt.format(new Date(e.at))}</span>,
              t(`history.kind.${e.kind}`),
              runLink(e.run_id),
              e.label ?? "—",
              e.by ? <span key="u" className="num">{name(e.by)}</span> : <span key="u" className="text-muted">{e.kind === "DECISION" || e.kind === "PREDICTION" ? t("history.engine") : na}</span>,
            ])} />
        )}
        {events.length >= LIMIT && <Notice text={t("history.limited")} />}
      </Panel>
    </div>
  );
}
