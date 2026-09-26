import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getT } from "@/lib/i18n";
import { getSessionContext } from "@/server/context";
import { peopleNames } from "@/server/people";
import { createSupabaseServer } from "@/lib/supabase/server";
import { addKnowledge, closeFailCase, recordFailStep } from "@/server/actions";
import { SPEC_NAME, nextKnowledgeStage, nextStep, type Step } from "@/lib/fail-loop/steps";
import { DataTable, Empty, Notice, PageHeader, Panel, formErrorKey } from "@/components/ui";

type Case = { id: string; run_id: string; status: string; outcome: string | null; outcome_evidence_saved: boolean;
  closed_note: string | null; closed_at: string | null; created_at: string; created_by: string | null; trigger_verification_id: string };
type StepRow = { seq: number; step: string; ref_id: string | null; payload: Record<string, unknown>; created_at: string; created_by: string | null };
type Item = { parameter: string; state: string; reason: string | null; unit: string | null; values: unknown[] };
type Option = { value: string; label: string };

const input = "w-full rounded border border-line bg-ground px-3 py-2 text-sm outline-none focus:border-teal";
const btn = "rounded bg-teal px-3 py-2 text-sm font-medium text-ground";

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
    .select("id, run_id, status, outcome, outcome_evidence_saved, closed_note, closed_at, created_at, created_by, trigger_verification_id")
    .eq("id", id).eq("organization_id", orgId).maybeSingle();
  if (!caseData) notFound();
  const c = caseData as Case;
  const [stepsRes, knowRes, runRes] = await Promise.all([
    supabase.from("fail_case_steps").select("seq, step, ref_id, payload, created_at, created_by").eq("case_id", id).order("seq"),
    supabase.from("knowledge_entries").select("stage, statement, created_at, created_by").eq("case_id", id).order("created_at"),
    supabase.from("runs").select("id, run_code, machine_id, process_plan_id").eq("id", c.run_id).maybeSingle(),
  ]);
  const steps = (stepsRes.data ?? []) as StepRow[];
  const knowledge = (knowRes.data ?? []) as { stage: string; statement: string; created_at: string; created_by: string | null }[];
  const run = runRes.data as { id: string; run_code: string; machine_id: string; process_plan_id: string | null } | null;
  const last = steps.at(-1) ?? null;
  const next = canDrive ? nextStep(last ? { step: last.step, payload: last.payload } : null, c.status === "OPEN") : null;
  const latestRef = (s: Step) => [...steps].reverse().find((x) => x.step === s)?.ref_id ?? null;
  const items = ((steps.find((s) => s.step === "DECOMPOSITION")?.payload.items ?? []) as Item[]);

  // options for the next step's reference: only records that the database will accept
  let options: Option[] = [];
  let createHref: string | null = null;
  const fmt = new Intl.DateTimeFormat(locale === "pl" ? "pl-PL" : "en-GB", { dateStyle: "short", timeStyle: "short" });
  const when = (x: string) => fmt.format(new Date(x));
  if (next === "QUARANTINE" && last) {
    const { data } = await supabase.from("quality_assessments").select("id, verdict, ruleset_version, created_at").eq("run_id", c.run_id).gte("created_at", last.created_at).order("created_at", { ascending: false });
    options = ((data ?? []) as { id: string; verdict: string; ruleset_version: string; created_at: string }[]).map((q) => ({ value: q.id, label: `${when(q.created_at)} · ${q.verdict} · ${q.ruleset_version}` }));
    createHref = `/runs/${c.run_id}/quality`;
  } else if (next === "STATE_REFRESH") {
    const qa = latestRef("QUARANTINE");
    const { data } = qa ? await supabase.from("state_snapshots").select("id, sha256, created_at").eq("quality_assessment_id", qa).order("created_at", { ascending: false }) : { data: [] };
    options = ((data ?? []) as { id: string; sha256: string; created_at: string }[]).map((s) => ({ value: s.id, label: `${when(s.created_at)} · ${s.sha256.slice(0, 12)}…` }));
    createHref = `/runs/${c.run_id}/diagnosis`;
  } else if (next === "DIAGNOSIS") {
    const sn = latestRef("STATE_REFRESH");
    const { data } = sn ? await supabase.from("diagnoses").select("id, status, gates_version, created_at").eq("snapshot_id", sn).order("created_at", { ascending: false }) : { data: [] };
    options = ((data ?? []) as { id: string; status: string; gates_version: string; created_at: string }[]).map((d) => ({ value: d.id, label: `${when(d.created_at)} · ${d.status} · ${d.gates_version}` }));
    createHref = `/runs/${c.run_id}/diagnosis`;
  } else if (next === "INTERVENTION" && run) {
    const { data } = await supabase.from("process_plans").select("id, version, created_at").eq("machine_id", run.machine_id).gte("created_at", c.created_at).order("created_at", { ascending: false });
    options = ((data ?? []) as { id: string; version: number; created_at: string }[]).filter((p) => p.id !== run.process_plan_id)
      .map((p) => ({ value: p.id, label: `${t("runs.planVersion")} ${p.version} · ${p.id.slice(0, 8)} · ${when(p.created_at)}` }));
    createHref = "/preflight";
  } else if (next === "CONTROLLED_TEST") {
    const plan = latestRef("INTERVENTION");
    const { data } = plan ? await supabase.from("runs").select("id, run_code, status, ended_at").eq("process_plan_id", plan).eq("status", "COMPLETED") : { data: [] };
    options = ((data ?? []) as { id: string; run_code: string; ended_at: string | null }[]).map((r) => ({ value: r.id, label: `${r.run_code}${r.ended_at ? ` · ${when(r.ended_at)}` : ""}` }));
    createHref = "/runs";
  } else if (next === "VERIFICATION") {
    const testRun = latestRef("CONTROLLED_TEST");
    const { data } = testRun ? await supabase.from("verifications").select("id, kind, state, verified_at").eq("run_id", testRun).order("verified_at", { ascending: false }) : { data: [] };
    options = ((data ?? []) as { id: string; kind: string; state: string; verified_at: string }[]).map((v) => ({ value: v.id, label: `${when(v.verified_at)} · ${t(`dashboard.verificationKind.${v.kind}`)} · ${t(`dashboard.verificationState.${v.state}`)}` }));
    createHref = testRun ? `/runs/${testRun}` : null;
  }
  const needsRef = next !== null && next !== "SEPARATION" && next !== "CONSOLIDATION";
  const stage = nextKnowledgeStage(c, knowledge.map((k) => k.stage));
  const name = await peopleNames(supabase, [c.created_by, ...steps.map((s) => s.created_by), ...knowledge.map((k) => k.created_by)]);
  const na = t("common.notAvailable");

  const summary = (s: StepRow): string => {
    const p = s.payload;
    const parts: string[] = [];
    if (s.step === "DECOMPOSITION") parts.push(((p.items as Item[] | undefined) ?? []).map((i) => `${i.parameter}: ${i.state}${i.values?.length ? ` [${i.values.join(", ")}]` : ""}`).join("; ") || String(p.note ?? ""));
    if (s.step === "SEPARATION") parts.push(`${t("failLoop.inScope")}: ${(p.in_scope as string[]).join(", ")}`, `${t("failLoop.outOfScope")}: ${(p.out_of_scope as string[]).join(", ") || "—"}`);
    if (s.step === "QUARANTINE") parts.push(`${p.verdict} · ${p.ruleset_version} · ${t("failLoop.quarantined")} ${p.quarantined}`);
    if (s.step === "CONSOLIDATION") parts.push(`${t("failLoop.measurements")} ${p.measurements} · ${t("failLoop.files")} ${(p.files as unknown[]).length}`);
    if (s.step === "STATE_REFRESH") parts.push(`SHA-256 ${String(p.sha256).slice(0, 12)}…`);
    if (s.step === "DIAGNOSIS") parts.push(`${p.status}${p.cause_category ? ` · ${p.cause_category}` : ""}`);
    if (s.step === "INTERVENTION") parts.push(((p.changes as { parameter: string; from: unknown; to: unknown; unit?: string }[]) ?? []).map((x) => `${x.parameter}: ${x.from} → ${x.to}${x.unit ? ` ${x.unit}` : ""}`).join("; "));
    if (s.step === "CONTROLLED_TEST") parts.push(String(p.run_status));
    if (s.step === "VERIFICATION") parts.push(`${t(`dashboard.verificationState.${p.state}`)} · ${t(`dashboard.verificationKind.${p.kind}`)}`);
    if (p.note && s.step !== "DECOMPOSITION") parts.push(`${t("failLoop.note")}: ${p.note}`);
    return parts.filter(Boolean).join(" · ");
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
          [t("failLoop.status"), t(`failLoop.caseStatus.${c.status}`)],
          [t("failLoop.outcome"), c.outcome ? `${t(`dashboard.verificationState.${c.outcome}`)}${c.outcome_evidence_saved ? ` · ${t("runDetail.evidenceSaved")}` : ""}` : c.status === "CLOSED" ? `${t("failLoop.closedWithout")}: ${c.closed_note ?? ""}` : "—"],
          [t("failLoop.opened"), <span key="o" className="num">{when(c.created_at)} · {name(c.created_by) ?? na}</span>],
        ]} />
        <Notice text={t("failLoop.rule")} />
      </Panel>

      <Panel title={t("failLoop.steps")}>
        <DataTable head={["#", t("failLoop.stepCol"), t("failLoop.content"), t("audit.time"), t("audit.user")]}
          rows={steps.map((s) => [
            <span key="n" className="num">{s.seq}</span>,
            <span key="s">{t(`failLoop.step.${s.step}`)} <span className="text-muted">({SPEC_NAME[s.step as Step]})</span></span>,
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
              {next === "SEPARATION" && (items.length === 0 ? <Notice tone="stop" text={t("failLoop.noItems")} /> : (
                <fieldset className="space-y-1 text-sm">
                  {items.map((i) => (
                    <label key={i.parameter} className="flex items-center gap-2">
                      <input type="checkbox" name="in_scope" value={i.parameter} />
                      <span>{i.parameter} · {i.state}{i.reason ? ` (${i.reason})` : ""}{i.values?.length ? ` [${i.values.join(", ")}]` : ""}</span>
                    </label>
                  ))}
                </fieldset>
              ))}
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
              {(!needsRef || options.length > 0) && !(next === "SEPARATION" && items.length === 0) && <button className={btn}>{t("failLoop.record")}</button>}
            </form>
          )}
          {canDrive && (
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
        {knowledge.length === 0 ? <Empty text={t("failLoop.noKnowledge")} /> : (
          <DataTable head={[t("failLoop.stage"), t("failLoop.statement"), t("audit.time"), t("audit.user")]}
            rows={knowledge.map((k) => [k.stage, k.statement, <span key="t" className="num">{when(k.created_at)}</span>, <span key="u" className="num">{name(k.created_by) ?? na}</span>])} />
        )}
        {canDrive && stage && (
          <form action={addKnowledge} className="space-y-2 border-t border-line px-4 py-4">
            <input type="hidden" name="case_id" value={id} />
            <input type="hidden" name="stage" value={stage} />
            <label className="block text-sm"><span className="mb-1 block text-muted">{`${t("failLoop.stage")} ${stage}`}</span>
              <textarea name="statement" required maxLength={4000} rows={3} className={input} /></label>
            <button className={btn}>{t("failLoop.addKnowledge")}</button>
          </form>
        )}
      </Panel>
    </div>
  );
}
