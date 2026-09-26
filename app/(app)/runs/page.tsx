import Link from "next/link";
import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n";
import { getSessionContext } from "@/server/context";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createRun } from "@/server/actions";
import { DataTable, Empty, Field, FormGrid, Notice, PageHeader, Panel, Select, formErrorKey } from "@/components/ui";

type RunRow = {
  id: string; run_code: string; status: string; machine_id: string; started_at: string | null; ended_at: string | null;
};
type PlanRow = { id: string; version: number; machine_id: string; preflight_status: string | null; approved_at: string | null; created_at: string };
type MachineRow = { id: string; manufacturer: string | null; model: string | null; serial_number: string | null };

export default async function RunsPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { t, locale } = await getT();
  const ctx = await getSessionContext();
  if (!ctx?.current) redirect("/dashboard");
  const orgId = ctx.current.organizationId;
  const canEdit = ctx.current.role !== "VIEWER";
  const errorKey = formErrorKey((await searchParams).e);

  const supabase = await createSupabaseServer();
  const [runsRes, machinesRes, plansRes] = await Promise.all([
    supabase.from("runs").select("id, run_code, status, machine_id, started_at, ended_at")
      .eq("organization_id", orgId).order("created_at", { ascending: false }).limit(200),
    supabase.from("machines").select("id, manufacturer, model, serial_number").eq("organization_id", orgId),
    supabase.from("process_plans").select("id, version, machine_id, preflight_status, approved_at, created_at")
      .eq("organization_id", orgId).order("created_at", { ascending: false }).limit(200),
  ]);
  const plans = (plansRes.data ?? []) as PlanRow[];
  const runs = (runsRes.data ?? []) as RunRow[];
  const machines = (machinesRes.data ?? []) as MachineRow[];
  const machineLabel = (m: MachineRow) =>
    [m.manufacturer, m.model, m.serial_number].filter(Boolean).join(" ") || m.id.slice(0, 8);
  const machineName = new Map(machines.map((m) => [m.id, machineLabel(m)]));
  const na = t("common.notAvailable");
  const planLabel = (p: PlanRow) => `${machineName.get(p.machine_id) ?? p.machine_id.slice(0, 8)} · ${t("runs.planVersion")} ${p.version} · ${p.id.slice(0, 8)} · ${
    p.approved_at ? t("runs.planApproved") : p.preflight_status ? t("runs.planDecided") : t("runs.planNoDecision")}`;
  const fmt = new Intl.DateTimeFormat(locale === "pl" ? "pl-PL" : "en-GB", { dateStyle: "short", timeStyle: "short" });
  const date = (v: string | null) => <span className="num">{v ? fmt.format(new Date(v)) : na}</span>;

  return (
    <div className="space-y-6">
      <PageHeader title={t("runs.title")} />

      <Panel title={t("runs.list")}>
        {runs.length === 0 ? <Empty text={t("runs.empty")} /> : (
          <DataTable
            head={[t("runs.code"), t("runs.machine"), t("runs.status"), t("runs.start"), t("runs.end"), ""]}
            rows={runs.map((r) => [
              <Link key="c" href={`/runs/${r.id}`} className="num text-teal hover:underline">{r.run_code}</Link>, machineName.get(r.machine_id) ?? na,
              t(`runStatus.${r.status}`), date(r.started_at), date(r.ended_at),
              <span key="i" className="flex gap-3 whitespace-nowrap">
                <Link href={`/runs/${r.id}/import`} className="text-teal hover:underline">{t("import.action")}</Link>
                <Link href={`/runs/${r.id}/quality`} className="text-teal hover:underline">{t("quality.action")}</Link>
                <Link href={`/runs/${r.id}/diagnosis`} className="text-teal hover:underline">{t("diagnosis.action")}</Link>
              </span>,
            ])}
          />
        )}
      </Panel>

      <Panel title={t("runs.add")}>
        {errorKey && <Notice tone="stop" text={t(errorKey)} />}
        <Notice text={t("runs.lifecycleHint")} />
        {!canEdit ? <Notice text={t("form.readOnly")} />
          : machines.length === 0 ? <Notice text={t("runs.noMachines")} />
          : (
            <FormGrid action={createRun} submit={t("form.add")}>
              <Field label={t("runs.code")} name="run_code" required maxLength={64} />
              <Select label={t("runs.machine")} name="machine_id" required
                options={machines.map((m) => ({ value: m.id, label: machineLabel(m) }))} />
              <Select label={t("runs.plan")} name="process_plan_id" empty={t("runs.noPlanOption")}
                options={plans.map((p) => ({ value: p.id, label: planLabel(p) }))} />
            </FormGrid>
          )}
      </Panel>
    </div>
  );
}
