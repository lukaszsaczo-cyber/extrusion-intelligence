import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getT } from "@/lib/i18n";
import { getSessionContext } from "@/server/context";
import { peopleNames } from "@/server/people";
import { createSupabaseServer } from "@/lib/supabase/server";
import { closeFailCase, recordFailStep } from "@/server/actions";
import { REF_STEPS, SPEC_NAME, canClose, nextStep, type Step } from "@/lib/fail-loop/steps";
import { DataTable, Empty, Notice, PageHeader, Panel, formErrorKey } from "@/components/ui";

type Case = { id: string; run_id: string; status: string; outcome: string | null; outcome_evidence_saved: boolean; locked_at: string | null;
  closed_note: string | null; closed_at: string | null; created_at: string; created_by: string | null; trigger_verification_id: string };
type StepRow = { seq: number; step: string; ref_id: string | null; payload: Record<string, unknown>; created_at: string; created_by: string | null };
type Item = { parameter: string; state: string; reason: string | null; unit: string | null; values: unknown[] };
type Change = { parameter: string; from: unknown; to: unknown; unit?: string | null };
type Option = { value: string; label: string };

const input = "w-full rounded border border-line bg-ground px-3 py-2 text-sm outline-none focus:border-teal";
const btn = "rounded bg-teal px-3 py-2 text-sm font-medium text-ground";
const list = (v: unknown) => (Array.isArray(v) ? v : []) as unknown[];
const short = (v: unknown) => (typeof v === "string" ? `${v.slice(0, 12)}…` : "—");

export default async function FailCasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ e?: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const errorKey = formErrorKey((await searchParams).e);
  const { t, locale } = await getT();
  const ctx = await getSessionContext();
  if (!ctx?.current) redirect("/dashboard");
  const orgId = ctx.current.organizationId;
  const canDrive = ["ADMIN", "ENGINEER"].includes(ctx.current.role);
  const supabase = await createSupabaseServer();
  const { data: caseData } = await supabase.from("fail_cases")
    .select("id, run_id, status, outcome, outcome_evidence_saved, locked_at, closed_note, closed_at, created_at, created_by, trigger_verification_id")
    .eq("id", id).eq("organization_id", orgId).maybeSingle();
  if (!caseData) notFound();
  const c = caseData as Case;
  const [stepsRes, knowRes, runRes] = await Promise.all([
    supabase.from("fail_case_steps").select("seq, step, ref_id, payload, created_at, created_by").eq("case_id", id).order("seq"),
    supabase.from("knowledge_entries").select("id, content, created_at, created_by").eq("case_id", id).maybeSingle(),
    supabase.from("runs").select("id, run_code, machine_id, process_plan_id").eq("id", c.run_id).maybeSingle(),
  ]);
  const steps = (stepsRes.data ?? []) as StepRow[];
  const knowledge = knowRes.data as { id: string; content: Record<string, unknown>; created_at: string; created_by: string | null } | null;
  const run = runRes.data as { id: string; run_code: string; machine_id: string; process_plan_id: string | null } | null;
  const last = steps.at(-1) ?? null;
  const latest = (s: Step) => [...steps].reverse().find((x) => x.step === s) ?? null;
  const diagnosisStatus = latest("DIAGNOSIS")?.payload.status;
  const next = canDrive ? nextStep({
    open: c.status === "OPEN", lastStep: last?.step ?? null,
    diagnosisStatus: typeof diagnosisStatus === "string" ? diagnosisStatus : null,
    pass: c.outcome === "VERIFIED_PASS" && c.outcome_evidence_saved,
  }) : null;

  // options for the next step's reference: only records that the database will accept
  let options: Option[] = [];
  let createHref: string | null = null;
  const fmt = new Intl.DateTimeFormat(locale === "pl" ? "pl-PL" : "en-GB", { dateStyle: "short", timeStyle: "short" });
  const when = (x: string) => fmt.format(new Date(x));
  const testRun = latest("CONTROLLED_TEST")?.ref_id ?? null;
  if (next === "DIAGNOSIS" && last) {
    // again after ODŚWIEŻENIE: only a diagnosis of the base state from 28
    const base = last.step === "STATE_REFRESH" ? latest("CONSOLIDATE")?.ref_id ?? null : null;
    let q = supabase.from("diagnoses").select("id, status, gates_version, created_at").eq("run_id", c.run_id).gte("created_at", last.created_at);
    if (last.step === "STATE_REFRESH") q = q.eq("snapshot_id", base ?? "00000000-0000-0000-0000-000000000000");
    const { data } = await q.order("created_at", { ascending: false });
    options = ((data ?? []) as { id: string; status: string; gates_version: string; created_at: string }[]).map((d) => ({ value: d.id, label: `${when(d.created_at)} · ${d.status} · ${d.gates_version}` }));
    createHref = `/runs/${c.run_id}/diagnosis`;
  } else if (next === "EXTRACT" && last) {
    const { data } = await supabase.from("quality_assessments").select("id, verdict, ruleset_version, created_at").eq("run_id", c.run_id).gte("created_at", last.created_at).order("created_at", { ascending: false });
    options = ((data ?? []) as { id: string; verdict: string; ruleset_version: string; created_at: string }[]).map((q) => ({ value: q.id, label: `${when(q.created_at)} · ${q.verdict} · ${q.ruleset_version}` }));
    createHref = `/runs/${c.run_id}/quality`;
  } else if (next === "CONSOLIDATE") {
    const qa = latest("EXTRACT")?.ref_id ?? null;
    const { data } = qa ? await supabase.from("state_snapshots").select("id, sha256, created_at").eq("quality_assessment_id", qa).order("created_at", { ascending: false }) : { data: [] };
    options = ((data ?? []) as { id: string; sha256: string; created_at: string }[]).map((s) => ({ value: s.id, label: `${when(s.created_at)} · ${s.sha256.slice(0, 12)}…` }));
    createHref = `/runs/${c.run_id}/diagnosis`;
  } else if (next === "INTERVENTION" && run) {
    const { data } = await supabase.from("process_plans").select("id, version, created_at").eq("machine_id", run.machine_id).gte("created_at", c.created_at).order("created_at", { ascending: false });
    options = ((data ?? []) as { id: string; version: number; created_at: string }[]).filter((p) => p.id !== run.process_plan_id)
      .map((p) => ({ value: p.id, label: `${t("runs.planVersion")} ${p.version} · ${p.id.slice(0, 8)} · ${when(p.created_at)}` }));
    createHref = "/preflight";
  } else if (next === "CONTROLLED_TEST") {
    const plan = latest("INTERVENTION")?.ref_id ?? null;
    const { data } = plan ? await supabase.from("runs").select("id, run_code, status, ended_at").eq("process_plan_id", plan).eq("status", "COMPLETED") : { data: [] };
    options = ((data ?? []) as { id: string; run_code: string; ended_at: string | null }[]).map((r) => ({ value: r.id, label: `${r.run_code}${r.ended_at ? ` · ${when(r.ended_at)}` : ""}` }));
    createHref = "/runs";
  } else if (next === "VERIFICATION") {
    const { data } = testRun ? await supabase.from("verifications").select("id, kind, state, verified_at").eq("run_id", testRun).order("verified_at", { ascending: false }) : { data: [] };
    options = ((data ?? []) as { id: string; kind: string; state: string; verified_at: string }[]).map((v) => ({ value: v.id, label: `${when(v.verified_at)} · ${t(`dashboard.verificationKind.${v.kind}`)} · ${t(`dashboard.verificationState.${v.state}`)}` }));
    createHref = testRun ? `/runs/${testRun}` : null;
  } else if (next === "AUDIT" && last) {
    // a seal of the controlled test run made after CROSS (it then contains this case)
    const { data } = testRun ? await supabase.from("audit_records").select("id, final_hash, created_at").eq("run_id", testRun).gte("created_at", last.created_at).order("created_at", { ascending: false }) : { data: [] };
    options = ((data ?? []) as { id: string; final_hash: string; created_at: string }[]).map((a) => ({ value: a.id, label: `${when(a.created_at)} · ${a.final_hash.slice(0, 12)}…` }));
    createHref = testRun ? `/runs/${testRun}` : null;
  }
  const needsRef = next !== null && REF_STEPS.includes(next);
  const name = await peopleNames(supabase, [c.created_by, knowledge?.created_by ?? null, ...steps.map((s) => s.created_by)]);
  const na = t("common.notAvailable");
  const changes = (v: unknown) => (list(v) as Change[]).map((x) => `${x.parameter}: ${x.from} → ${x.to}${x.unit ? ` ${x.unit}` : ""}`).join("; ");
  const passed = (v: unknown) => (list(v) as Item[]).map((i) => `${i.parameter}${i.values?.length ? ` [${i.values.join(", ")}]` : ""}`).join("; ");

  const summary = (s: StepRow): React.ReactNode => {
    const p = s.payload;
    const parts: string[] = [];
    const signals = (v: unknown) => (list(v) as { signal: string }[]).map((x) => x.signal).join(", ") || "—";
    const names = (v: unknown) => (list(v) as string[]).join(", ") || "—";
    if (s.step === "DECOMPOSITION") parts.push((list(p.items) as Item[]).map((i) => `${i.parameter}: ${i.state}${i.values?.length ? ` [${i.values.join(", ")}]` : ""}`).join("; "));
    if (s.step === "DIAGNOSIS") parts.push(`${p.status}${p.cause_category ? ` · ${p.cause_category}` : ""}`);
    if (s.step === "EXTRACT") parts.push(`${p.verdict} · ${p.ruleset_version}`,
      `${t("failLoop.correct")}: ${t("failLoop.signals")} ${signals(p.data_correct)}; ${t("failLoop.items")} ${names(p.product_correct)}`,
      `${t("failLoop.erroneous")}: ${t("failLoop.signals")} ${signals(p.data_erroneous)}; ${t("failLoop.items")} ${names(p.product_erroneous)}`);
    if (s.step === "PURGE") parts.push(`${t("failLoop.excludedSamples")} ${p.excluded_samples}`,
      `${t("failLoop.excludedSignals")} ${names(p.excluded_signals)}`, `${t("failLoop.failedItems")} ${names(p.failed_items)}`,
      `${t("failLoop.rejectedPlan")} ${typeof p.rejected_plan_id === "string" ? p.rejected_plan_id.slice(0, 8) : "—"}`, t("failLoop.rawUnchanged"));
    if (s.step === "CONSOLIDATE") parts.push(`SHA-256 ${short(p.sha256)}`, `${t("failLoop.cleanSamples")} ${p.clean_samples ?? "—"}`, `${t("failLoop.keptItems")} ${names(p.kept_product_items)}`);
    if (s.step === "STATE_REFRESH") parts.push(`${t("failLoop.base")} SHA-256 ${short(p.sha256)}`);
    if (s.step === "INTERVENTION") parts.push(changes(p.changes));
    if (s.step === "CONTROLLED_TEST") parts.push(String(p.run_status));
    if (s.step === "VERIFICATION") parts.push(`${t(`dashboard.verificationState.${p.state}`)} · ${t(`dashboard.verificationKind.${p.kind}`)}`);
    if (s.step === "REPORT") parts.push(`${t("failLoop.outcome")}: ${p.outcome ? t(`dashboard.verificationState.${p.outcome}`) : "—"}`,
      `${t("failLoop.cycles")} ${p.cycles} · ${t("failLoop.diagnoses")} ${p.diagnoses}`,
      p.next === "FILTER" ? t("failLoop.reportNextFilter") : t("failLoop.reportClosed"));
    if (s.step === "FILTER") parts.push(`${t("failLoop.passed")}: ${passed(p.passed)}`);
    if (s.step === "VERIFY_PERSIST") parts.push(`${t("failLoop.rechecked")}: ${t(`dashboard.verificationState.${p.rechecked_state}`)}`);
    if (s.step === "LOCK") parts.push(t("failLoop.threshold"));
    if (s.step === "CROSS") parts.push(`${t("failLoop.newBaseline")} ${typeof p.new_baseline_plan_id === "string" ? p.new_baseline_plan_id.slice(0, 8) : "—"}`);
    if (p.note) parts.push(`${t("failLoop.note")}: ${p.note}`);
    const text = parts.filter(Boolean).join(" · ");
    return s.step === "AUDIT" && typeof p.audit_record_id === "string"
      ? <Link href={`/audit/${p.audit_record_id}`} className="underline decoration-line underline-offset-4">{t("failLoop.auditRecord")}{text ? ` · ${text}` : ""}</Link>
      : text;
  };

  return (
    <div className="space-y-6">
      <PageHeader title={`${t("failLoop.case")}: ${run?.run_code ?? na}`}>
        <Link href="/fail-cases" className="rounded border border-line px-3 py-2 text-sm">{t("import.back")}</Link>
      </PageHeader>
      {errorKey && <p className="text-sm text-stop">{t(errorKey)}</p>}

      <Panel title={t("failLoop.summary")}>
        <DataTable head={[t("preflight.field"), t("preflight.valueCol")]} rows={[
          [t("runs.code"), run ? <Link key="r" href={`/runs/${run.id}`} className="underline decoration-line underline-offset-4">{run.run_code}</Link> : na],
          [t("failLoop.status"), `${t(`failLoop.caseStatus.${c.status}`)}${c.locked_at ? ` · ${t("failLoop.locked")}` : ""}`],
          [t("failLoop.outcome"), c.outcome ? `${t(`dashboard.verificationState.${c.outcome}`)}${c.outcome_evidence_saved ? ` · ${t("runDetail.evidenceSaved")}` : ""}` : c.status === "CLOSED" ? `${t("failLoop.closedWithout")}: ${c.closed_note ?? ""}` : "—"],
          [t("failLoop.opened"), <span key="o" className="num">{when(c.created_at)} · {name(c.created_by) ?? na}</span>],
        ]} />
        <Notice text={t("failLoop.rule")} />
      </Panel>

      <Panel title={t("failLoop.steps")}>
        <DataTable head={["#", t("failLoop.stepCol"), t("failLoop.content"), t("audit.time"), t("audit.user")]}
          rows={steps.map((s) => [
            <span key="n" className="num">{s.seq}</span>,
            <span key="s">{t(`failLoop.step.${s.step}`)} <span className="text-muted">({SPEC_NAME[s.step as Step] ?? s.step})</span></span>,
            <span key="c" className="text-sm">{summary(s)}</span>,
            <span key="t" className="num">{when(s.created_at)}</span>,
            <span key="u" className="num">{name(s.created_by) ?? na}</span>,
          ])} />
      </Panel>

      {c.status === "OPEN" && (
        <Panel title={next ? `${t("failLoop.next")}: ${t(`failLoop.step.${next}`)} (${SPEC_NAME[next]})` : t("failLoop.next")}>
          {!canDrive ? <Notice text={t("form.readOnly")} /> : !next ? <Notice tone="stop" text={t("failLoop.noNext")} /> : (
            <form action={recordFailStep} className="space-y-3 px-4 py-4">
              <input type="hidden" name="case_id" value={id} />
              <input type="hidden" name="step" value={next} />
              <p className="text-sm text-muted">{t(`failLoop.stepHint.${next}`)}</p>
              {needsRef && (options.length === 0 ? (
                <p className="text-sm text-caution">{t("failLoop.noOptions")} {createHref && <Link href={createHref} className="underline">{t("failLoop.create")}</Link>}</p>
              ) : (
                <label className="block text-sm"><span className="mb-1 block text-muted">{t("failLoop.reference")}</span>
                  <select name="ref_id" required className={input}>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
                </label>
              ))}
              {next === "INTERVENTION" && (
                <div className="space-y-2">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="grid gap-2 sm:grid-cols-4">
                      <input name={`change_${i}_parameter`} placeholder={t("failLoop.parameter")} maxLength={64} className={input} required={i === 0} />
                      <input name={`change_${i}_from`} placeholder={t("failLoop.from")} maxLength={40} className={input} required={i === 0} />
                      <input name={`change_${i}_to`} placeholder={t("failLoop.to")} maxLength={40} className={input} required={i === 0} />
                      <input name={`change_${i}_unit`} placeholder={t("failLoop.unit")} maxLength={16} className={input} />
                    </div>
                  ))}
                </div>
              )}
              <label className="block text-sm"><span className="mb-1 block text-muted">{next === "INTERVENTION" ? t("failLoop.rationale") : t("failLoop.noteOptional")}</span>
                <textarea name="note" maxLength={2000} rows={2} required={next === "INTERVENTION"} className={input} /></label>
              {(!needsRef || options.length > 0) && <button className={btn}>{t("failLoop.record")}</button>}
            </form>
          )}
          {canDrive && canClose(c) && (
            <form action={closeFailCase} className="space-y-2 border-t border-line px-4 py-4">
              <input type="hidden" name="case_id" value={id} />
              <label className="block text-sm"><span className="mb-1 block text-muted">{t("failLoop.closeReason")}</span>
                <input name="note" required maxLength={2000} className={input} /></label>
              <button className="rounded border border-line px-3 py-2 text-sm">{t("failLoop.close")}</button>
            </form>
          )}
        </Panel>
      )}

      <Panel title={t("failLoop.knowledge")}>
        <Notice text={t("failLoop.knowledgeRule")} />
        {!knowledge ? <Empty text={t("failLoop.noKnowledge")} /> : (
          <DataTable head={[t("failLoop.passed"), t("failLoop.change"), t("audit.time"), t("audit.user")]}
            rows={[[
              passed(knowledge.content.passed),
              changes((knowledge.content.intervention as Record<string, unknown> | undefined)?.changes),
              <span key="t" className="num">{when(knowledge.created_at)}</span>,
              <span key="u" className="num">{name(knowledge.created_by) ?? na}</span>,
            ]]} />
        )}
      </Panel>
    </div>
  );
}
