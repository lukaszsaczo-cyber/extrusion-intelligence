import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getT } from "@/lib/i18n";
import { getSessionContext } from "@/server/context";
import { compareWithContract, engineConfigured, METRIC_UNITS } from "@/server/engine";
import { createSupabaseServer } from "@/lib/supabase/server";
import { addMeasurement, cancelPlannedRun, createProductSample, endRun, openFailCase, recordProductVerification, requestEngineVerification, sealRunAudit, setRunPlan, startRun } from "@/server/actions";
import type { Snapshot } from "@/lib/diagnosis/snapshot";
import { predictedVsActual, productCheck, type Measurement, type Prediction, type TargetValue } from "@/lib/verification/checks";
import { DataTable, Empty, Field, FormGrid, Notice, PageHeader, Panel, Select, formErrorKey } from "@/components/ui";

type Run = { id: string; run_code: string; status: string; machine_id: string; process_plan_id: string | null; started_at: string | null; ended_at: string | null };
type Sample = { id: string; sample_code: string; taken_at: string | null };
type Meas = { id: string; product_sample_id: string; parameter: string; value: number; unit: string | null; method: string | null; created_at: string };
type Verification = { id: string; kind: string; state: string; evidence_saved: boolean; verified_at: string };

const stateTone = (s: string) => (s === "VERIFIED_PASS" || s === "WITHIN_RANGE" ? "text-teal"
  : s === "VERIFIED_FAIL" || s === "OUTSIDE_RANGE" ? "text-stop" : s === "POINT_PREDICTION" ? "text-ink" : "text-caution");

export default async function RunDetail({ params, searchParams }: {
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
  const { data: runData } = await supabase.from("runs").select("id, run_code, status, machine_id, process_plan_id, started_at, ended_at")
    .eq("id", id).eq("organization_id", orgId).maybeSingle();
  if (!runData) notFound();
  const run = runData as Run;

  const [metricsCountRes, filesRes, qaRes, snapRes, samplesRes, verRes, planRes, auditRes] = await Promise.all([
    supabase.from("run_metrics").select("id", { count: "exact", head: true }).eq("run_id", id),
    supabase.from("run_files").select("filename, created_at, row_count, column_count").eq("run_id", id).order("created_at"),
    supabase.from("quality_assessments").select("verdict, ruleset_version, created_at").eq("run_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("state_snapshots").select("snapshot, created_at").eq("run_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("product_samples").select("id, sample_code, taken_at").eq("run_id", id).order("created_at"),
    supabase.from("verifications").select("id, kind, state, evidence_saved, verified_at").eq("run_id", id).order("verified_at", { ascending: false }),
    run.process_plan_id
      ? supabase.from("process_plans").select("id, product_target_id, feed_kg_h, screw_rpm, water_kg_h, steam_kg_h, cutter_rpm, zone_setpoints_c, preflight_status, approved_at").eq("id", run.process_plan_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("audit_records").select("id, created_at, final_hash").eq("run_id", id).order("created_at", { ascending: false }),
  ]);
  const machinePlansRes = run.status === "PLANNED"
    ? await supabase.from("process_plans").select("id, version, preflight_status, approved_at").eq("organization_id", orgId).eq("machine_id", run.machine_id)
      .order("created_at", { ascending: false }).limit(100)
    : { data: [] };
  const machinePlans = (machinePlansRes.data ?? []) as { id: string; version: number; preflight_status: string | null; approved_at: string | null }[];
  const audits = (auditRes.data ?? []) as { id: string; created_at: string; final_hash: string }[];
  const failCasesRes = await supabase.from("fail_cases").select("id, trigger_verification_id, status").eq("run_id", id);
  const caseOf = new Map(((failCasesRes.data ?? []) as { id: string; trigger_verification_id: string; status: string }[]).map((f) => [f.trigger_verification_id, f]));
  const samples = (samplesRes.data ?? []) as Sample[];
  const measRes = samples.length
    ? await supabase.from("product_measurements").select("id, product_sample_id, parameter, value, unit, method, created_at")
      .in("product_sample_id", samples.map((s) => s.id)).order("created_at")
    : { data: [] as Meas[] };
  const measurements = ((measRes.data ?? []) as Meas[]).map((m) => ({ ...m, value: Number(m.value) }));
  const verifications = (verRes.data ?? []) as Verification[];
  const plan = planRes.data as null | {
    id: string; product_target_id: string | null; feed_kg_h: number | null; screw_rpm: number | null; water_kg_h: number | null;
    steam_kg_h: number | null; cutter_rpm: number | null; zone_setpoints_c: number[]; preflight_status: string | null; approved_at: string | null;
  };
  const [predRes, targetRes] = await Promise.all([
    plan ? supabase.from("plan_predictions").select("metric, kind, value, min_value, max_value").eq("process_plan_id", plan.id) : Promise.resolve({ data: [] }),
    plan?.product_target_id ? supabase.from("product_target_values").select("parameter, unit, min_value, target_value, max_value").eq("product_target_id", plan.product_target_id) : Promise.resolve({ data: [] }),
  ]);
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  const predictions: Prediction[] = ((predRes.data ?? []) as { metric: string; kind: "VALUE" | "RANGE"; value: unknown; min_value: unknown; max_value: unknown }[])
    .map((p) => ({ metric: p.metric, kind: p.kind, value: num(p.value), min: num(p.min_value), max: num(p.max_value) }));
  const snapshot = (snapRes.data?.snapshot as Snapshot | undefined) ?? null;
  const pva = predictedVsActual(predictions, snapshot?.signals ?? null, METRIC_UNITS, compareWithContract);
  const targets: TargetValue[] = ((targetRes.data ?? []) as TargetValue[]).map((x) => ({ ...x, min_value: num(x.min_value), target_value: num(x.target_value), max_value: num(x.max_value) }));
  const product = productCheck(targets, measurements as Measurement[]);

  const canMeasure = ["ADMIN", "ENGINEER", "OPERATOR"].includes(ctx.current.role);
  const canSeal = ["ADMIN", "ENGINEER"].includes(ctx.current.role);
  const planState = (p: { preflight_status: string | null; approved_at: string | null }) =>
    p.approved_at ? t("runs.planApproved") : p.preflight_status ? t("runs.planDecided") : t("runs.planNoDecision");
  const btn = "rounded bg-teal px-3 py-2 text-sm font-medium text-ground";
  const btnLine = "rounded border border-line px-3 py-2 text-sm";
  const timeInput = <label className="block text-sm"><span className="mb-1 block text-muted">{t("runDetail.timeOptional")}</span>
    <input name="at" placeholder="2026-09-26T08:00+02:00" maxLength={40} className="w-full rounded border border-line bg-ground px-3 py-2 text-sm outline-none focus:border-teal" /></label>;
  const na = t("common.notAvailable");
  const fmt = new Intl.DateTimeFormat(locale === "pl" ? "pl-PL" : "en-GB", { dateStyle: "short", timeStyle: "short" });
  const date = (x: string | null) => <span className="num">{x ? fmt.format(new Date(x)) : na}</span>;
  const n = (x: number | null) => <span className="num">{x ?? "—"}</span>;
  const sampleCode = new Map(samples.map((s) => [s.id, s.sample_code]));

  return (
    <div className="space-y-6">
      <PageHeader title={`${t("runDetail.title")}: ${run.run_code}`}>
        <Link href={`/runs/${id}/import`} className="rounded border border-line px-3 py-2 text-sm">{t("import.action")}</Link>
        <Link href={`/runs/${id}/quality`} className="rounded border border-line px-3 py-2 text-sm">{t("quality.action")}</Link>
        <Link href={`/runs/${id}/diagnosis`} className="rounded border border-line px-3 py-2 text-sm">{t("diagnosis.action")}</Link>
        <Link href="/runs" className="rounded border border-line px-3 py-2 text-sm">{t("import.back")}</Link>
      </PageHeader>
      {errorKey && <p className="text-sm text-stop">{t(errorKey)}</p>}

      <Panel title={t("runDetail.data")}>
        <DataTable head={[t("preflight.field"), t("preflight.valueCol")]} rows={[
          [t("runs.status"), t(`runStatus.${run.status}`)],
          [t("runs.start"), date(run.started_at)], [t("runs.end"), date(run.ended_at)],
          [t("runDetail.samples"), <span key="c" className="num">{metricsCountRes.count ?? na}</span>],
          [t("console.dataFiles"), (filesRes.data ?? []).length === 0 ? t("console.noFiles")
            : (filesRes.data ?? []).map((f: { filename: string; created_at: string }) => `${f.filename} (${fmt.format(new Date(f.created_at))})`).join("; ")],
        ]} />
      </Panel>

      <Panel title={t("runDetail.lifecycle")}>
        <Notice text={t("runDetail.lifecycleHint")} />
        <DataTable head={[t("preflight.field"), t("preflight.valueCol")]} rows={[
          [t("runs.status"), t(`runStatus.${run.status}`)],
          [t("runs.plan"), plan
            ? <Link key="p" href={`/preflight/${plan.id}`} className="underline decoration-line underline-offset-4">{`${plan.id.slice(0, 8)} · ${planState(plan)}`}</Link>
            : t("runDetail.noPlan")],
        ]} />
        {canMeasure && run.status === "PLANNED" && (
          <div className="space-y-3 border-t border-line px-4 py-4">
            <form action={setRunPlan} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <input type="hidden" name="run_id" value={id} />
              <label className="block text-sm"><span className="mb-1 block text-muted">{t("runs.plan")}</span>
                <select name="process_plan_id" defaultValue={run.process_plan_id ?? ""} className="w-full rounded border border-line bg-ground px-3 py-2 text-sm outline-none focus:border-teal">
                  <option value="">{t("runs.noPlanOption")}</option>
                  {machinePlans.map((p) => <option key={p.id} value={p.id}>{`${t("runs.planVersion")} ${p.version} · ${p.id.slice(0, 8)} · ${planState(p)}`}</option>)}
                </select></label>
              <button className={btnLine}>{t("runDetail.linkPlan")}</button>
            </form>
            {plan?.approved_at ? (
              <form action={startRun} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <input type="hidden" name="run_id" value={id} />
                {timeInput}
                <button className={btn}>{t("runDetail.start")}</button>
              </form>
            ) : <p className="text-sm text-caution">{t("runDetail.startNeedsApproval")}</p>}
            <form action={cancelPlannedRun}>
              <input type="hidden" name="run_id" value={id} />
              <button className={btnLine}>{t("runDetail.cancel")}</button>
            </form>
          </div>
        )}
        {canMeasure && run.status === "RUNNING" && (
          <form action={endRun} className="grid gap-3 border-t border-line px-4 py-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <input type="hidden" name="run_id" value={id} />
            <label className="block text-sm"><span className="mb-1 block text-muted">{t("runDetail.outcome")}</span>
              <select name="outcome" required defaultValue="" className="w-full rounded border border-line bg-ground px-3 py-2 text-sm outline-none focus:border-teal">
                <option value="" disabled>—</option>
                <option value="COMPLETED">{t("runStatus.COMPLETED")}</option>
                <option value="ABORTED">{t("runStatus.ABORTED")}</option>
              </select></label>
            {timeInput}
            <button className={btn}>{t("runDetail.end")}</button>
          </form>
        )}
        {(run.status === "COMPLETED" || run.status === "ABORTED") && <Notice text={t("runDetail.final")} />}
      </Panel>

      <Panel title={t("runDetail.parameters")}>
        {!plan ? <Empty text={t("runDetail.noPlan")} /> : (
          <DataTable head={[t("preflight.field"), t("preflight.valueCol")]} rows={[
            [t("preflight.feed"), n(num(plan.feed_kg_h))], [t("preflight.rpm"), n(num(plan.screw_rpm))],
            [t("preflight.water"), n(num(plan.water_kg_h))], [t("preflight.steam"), n(num(plan.steam_kg_h))],
            [t("preflight.cutterRpm"), n(num(plan.cutter_rpm))], [t("preflight.zones"), (plan.zone_setpoints_c ?? []).join(", ") || na],
            [t("preflight.engineDecision"), plan.preflight_status ? t(`dashboard.decision.${plan.preflight_status}`) : na],
            [t("preflight.approval"), plan.approved_at ? t("preflight.approved") : t("preflight.notApproved")],
          ]} />
        )}
      </Panel>

      <Panel title={t("runDetail.quality")}>
        <p className="px-4 py-4 text-sm">
          {qaRes.data ? <>{t(`quality.verdict.${qaRes.data.verdict}`)} <span className="text-muted">· {qaRes.data.ruleset_version} · {fmt.format(new Date(qaRes.data.created_at))}</span></> : t("runDetail.noQuality")}
        </p>
      </Panel>

      <Panel title={t("runDetail.pva")}>
        <Notice text={t("runDetail.pvaHint")} />
        {predictions.length === 0 ? <Empty text={t("runDetail.noPredictions")} /> : (
          <DataTable head={[t("runDetail.metric"), t("runDetail.predicted"), t("runDetail.actual"), "n", "min … max", t("runDetail.result"), t("runDetail.difference")]}
            rows={pva.map((r) => [
              `${r.metric} [${r.unit}]`,
              <span key="p" className="num">{r.prediction.kind === "VALUE" ? r.prediction.value : `${r.prediction.min} … ${r.prediction.max}`}</span>,
              n(r.actualMedian), n(r.n), <span key="mm" className="num">{r.min ?? "—"} … {r.max ?? "—"}</span>,
              <span key="s" className={stateTone(r.status)}>{t(`runDetail.cmp.${r.status}`)}{r.reason ? ` · ${t(`runDetail.pvaReason.${r.reason}`)}` : ""}</span>,
              n(r.difference),
            ])} />
        )}
      </Panel>

      <Panel title={t("runDetail.measurements")}>
        {samples.length === 0 ? <Empty text={t("runDetail.noSamples")} /> : measurements.length === 0 ? <Empty text={t("runDetail.noMeasurements")} /> : (
          <DataTable head={[t("runDetail.sample"), t("product.parameter"), t("console.value"), t("product.unit"), t("runDetail.method"), t("runDetail.recorded")]}
            rows={measurements.map((m) => [sampleCode.get(m.product_sample_id) ?? na, m.parameter, n(m.value), m.unit ?? na, m.method ?? na, date(m.created_at)])} />
        )}
        <Notice text={t("runDetail.appendOnly")} />
        {canMeasure ? (<>
          <FormGrid action={createProductSample} submit={t("runDetail.addSample")}>
            <input type="hidden" name="run_id" value={id} />
            <Field label={t("runDetail.sample")} name="sample_code" required maxLength={64} />
            <Field label={t("runDetail.takenAt")} name="taken_at" maxLength={40} />
          </FormGrid>
          {samples.length > 0 && (
            <FormGrid action={addMeasurement} submit={t("runDetail.addMeasurement")}>
              <input type="hidden" name="run_id" value={id} />
              <Select label={t("runDetail.sample")} name="product_sample_id" required options={samples.map((s) => ({ value: s.id, label: s.sample_code }))} />
              <Field label={t("product.parameter")} name="parameter" required maxLength={64} />
              <Field label={t("console.value")} name="value" type="number" step="any" required />
              <Field label={t("product.unit")} name="unit" maxLength={32} />
              <Field label={t("runDetail.method")} name="method" maxLength={200} />
            </FormGrid>
          )}
        </>) : <Notice text={t("form.readOnly")} />}
      </Panel>

      <Panel title={t("runDetail.productCheck")}>
        <p className="px-4 pt-4 text-sm">{t("preflight.knownOverall")}: <span className={`font-medium ${stateTone(product.overall)}`}>{t(`dashboard.verificationState.${product.overall}`)}</span>
          {product.reason ? <span className="text-muted"> · {t(`runDetail.productReason.${product.reason}`)}</span> : null}</p>
        <Notice text={t("runDetail.productHint")} />
        {product.rows.length > 0 && (
          <DataTable head={[t("product.parameter"), "min … max", t("runDetail.measured"), t("runDetail.result")]}
            rows={product.rows.map((r) => [
              `${r.parameter}${r.unit ? ` [${r.unit}]` : ""}`, <span key="mm" className="num">{r.min ?? "—"} … {r.max ?? "—"}</span>,
              <span key="v" className="num">{r.values.join(", ") || "—"}</span>,
              <span key="s" className={stateTone(r.state)}>{t(`dashboard.verificationState.${r.state}`)}{r.reason ? ` · ${t(`runDetail.productReason.${r.reason}`)}` : ""}</span>,
            ])} />
        )}
      </Panel>

      <Panel title={t("runDetail.verification")}>
        {verifications.length === 0 ? (
          <div className="px-4 py-4 text-sm">
            <p className="font-medium text-unknown">{na}</p>
            <p className="mt-1 text-muted">{t("runDetail.noVerification")}</p>
          </div>
        ) : (
          <DataTable head={[t("runDetail.kind"), t("runDetail.result"), t("runDetail.evidence"), t("runDetail.recorded"), t("failLoop.title")]}
            rows={verifications.map((v) => [t(`dashboard.verificationKind.${v.kind}`),
              <span key="s" className={stateTone(v.state)}>{t(`dashboard.verificationState.${v.state}`)}</span>,
              v.evidence_saved ? t("runDetail.evidenceSaved") : t("runDetail.evidenceNotSaved"), date(v.verified_at),
              caseOf.get(v.id)
                ? <Link key="f" href={`/fail-cases/${caseOf.get(v.id)!.id}`} className="underline decoration-line underline-offset-4">{t(`failLoop.caseStatus.${caseOf.get(v.id)!.status}`)}</Link>
                : v.state === "VERIFIED_FAIL" && canSeal
                  ? <form key="f" action={openFailCase}><input type="hidden" name="verification_id" value={v.id} /><input type="hidden" name="run_id" value={id} /><button className="text-stop underline">{t("failLoop.open")}</button></form>
                  : "—"])} />
        )}
        {canSeal && run.status === "COMPLETED" && (
          <form action={recordProductVerification} className="border-t border-line px-4 py-3">
            <input type="hidden" name="run_id" value={id} />
            <p className="mb-2 text-sm text-muted">{t("runDetail.productVerificationHint")}</p>
            <button className="rounded border border-line px-3 py-2 text-sm">{t("runDetail.recordProductVerification")}</button>
          </form>
        )}
        {canSeal && run.status === "COMPLETED" && (engineConfigured() ? (
          <form action={requestEngineVerification} className="border-t border-line px-4 py-3">
            <input type="hidden" name="run_id" value={id} />
            <button className="rounded bg-teal px-3 py-2 text-sm font-medium text-ground">{t("runDetail.askVerification")}</button>
          </form>
        ) : <Notice text={t("runDetail.verificationEngineOff")} />)}
      </Panel>

      <Panel title={t("audit.title")}>
        <Notice text={t("audit.sealHint")} />
        {audits.length === 0 ? <Empty text={t("audit.noRecords")} /> : (
          <DataTable head={[t("audit.sealedAt"), t("audit.hash"), ""]}
            rows={audits.map((a) => [date(a.created_at), <span key="h" className="num">{a.final_hash.slice(0, 12)}…</span>,
              <Link key="o" href={`/audit/${a.id}`} className="underline decoration-line underline-offset-4">{t("audit.open")}</Link>])} />
        )}
        {canSeal && (
          <form action={sealRunAudit} className="border-t border-line px-4 py-3">
            <input type="hidden" name="run_id" value={id} />
            <button className="rounded bg-teal px-3 py-2 text-sm font-medium text-ground">{t("audit.seal")}</button>
          </form>
        )}
      </Panel>
    </div>
  );
}
