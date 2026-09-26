import Link from "next/link";
import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n";
import { getSessionContext } from "@/server/context";
import { createSupabaseServer } from "@/lib/supabase/server";
import { DataTable, Empty, Notice, PageHeader, Panel } from "@/components/ui";

type Case = { id: string; run_id: string; status: string; outcome: string | null; created_at: string; closed_at: string | null };

export default async function FailCasesPage() {
  const { t, locale } = await getT();
  const ctx = await getSessionContext();
  if (!ctx?.current) redirect("/dashboard");
  const orgId = ctx.current.organizationId;
  const supabase = await createSupabaseServer();
  const { data } = await supabase.from("fail_cases").select("id, run_id, status, outcome, created_at, closed_at")
    .eq("organization_id", orgId).order("created_at", { ascending: false }).limit(200);
  const cases = (data ?? []) as Case[];
  const ids = cases.map((c) => c.id);
  const runIds = [...new Set(cases.map((c) => c.run_id))];
  const [stepsRes, runsRes] = await Promise.all([
    ids.length ? supabase.from("fail_case_steps").select("case_id, seq, step").in("case_id", ids) : Promise.resolve({ data: [] }),
    runIds.length ? supabase.from("runs").select("id, run_code").in("id", runIds) : Promise.resolve({ data: [] }),
  ]);
  const lastStep = new Map<string, { seq: number; step: string }>();
  for (const s of (stepsRes.data ?? []) as { case_id: string; seq: number; step: string }[]) {
    const cur = lastStep.get(s.case_id);
    if (!cur || s.seq > cur.seq) lastStep.set(s.case_id, s);
  }
  const runCode = new Map(((runsRes.data ?? []) as { id: string; run_code: string }[]).map((r) => [r.id, r.run_code]));
  const fmt = new Intl.DateTimeFormat(locale === "pl" ? "pl-PL" : "en-GB", { dateStyle: "short", timeStyle: "short" });

  return (
    <div className="space-y-6">
      <PageHeader title={t("failLoop.title")} />
      <Notice text={t("failLoop.hint")} />
      <Panel title={t("failLoop.cases")}>
        {cases.length === 0 ? <Empty text={t("failLoop.noCases")} /> : (
          <DataTable head={[t("runs.code"), t("failLoop.opened"), t("failLoop.status"), t("failLoop.lastStep"), t("failLoop.outcome"), ""]}
            rows={cases.map((c) => [
              <Link key="r" href={`/runs/${c.run_id}`} className="underline decoration-line underline-offset-4">{runCode.get(c.run_id) ?? c.run_id.slice(0, 8)}</Link>,
              <span key="t" className="num">{fmt.format(new Date(c.created_at))}</span>,
              t(`failLoop.caseStatus.${c.status}`),
              lastStep.get(c.id) ? t(`failLoop.step.${lastStep.get(c.id)!.step}`) : "—",
              c.outcome ? t(`dashboard.verificationState.${c.outcome}`) : c.status === "CLOSED" ? t("failLoop.closedWithout") : "—",
              <Link key="o" href={`/fail-cases/${c.id}`} className="underline decoration-line underline-offset-4">{t("audit.open")}</Link>,
            ])} />
        )}
      </Panel>
    </div>
  );
}
