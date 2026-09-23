import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n";
import { getSessionContext } from "@/server/context";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createRun } from "@/server/actions";
import { DataTable, Empty, Field, FormGrid, Notice, PageHeader, Panel, Select, formErrorKey } from "@/components/ui";

type RunRow = {
  id: string; run_code: string; status: string; machine_id: string; started_at: string | null; ended_at: string | null;
};
type MachineRow = { id: string; manufacturer: string | null; model: string | null; serial_number: string | null };

export default async function RunsPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { t, locale } = await getT();
  const ctx = await getSessionContext();
  if (!ctx?.current) redirect("/dashboard");
  const orgId = ctx.current.organizationId;
  const canEdit = ctx.current.role !== "VIEWER";
  const errorKey = formErrorKey((await searchParams).e);

  const supabase = await createSupabaseServer();
  const [runsRes, machinesRes] = await Promise.all([
    supabase.from("runs").select("id, run_code, status, machine_id, started_at, ended_at")
      .eq("organization_id", orgId).order("created_at", { ascending: false }).limit(200),
    supabase.from("machines").select("id, manufacturer, model, serial_number").eq("organization_id", orgId),
  ]);
  const runs = (runsRes.data ?? []) as RunRow[];
  const machines = (machinesRes.data ?? []) as MachineRow[];
  const machineLabel = (m: MachineRow) =>
    [m.manufacturer, m.model, m.serial_number].filter(Boolean).join(" ") || m.id.slice(0, 8);
  const machineName = new Map(machines.map((m) => [m.id, machineLabel(m)]));
  const na = t("common.notAvailable");
  const fmt = new Intl.DateTimeFormat(locale === "pl" ? "pl-PL" : "en-GB", { dateStyle: "short", timeStyle: "short" });
  const date = (v: string | null) => <span className="num">{v ? fmt.format(new Date(v)) : na}</span>;

  return (
    <div className="space-y-6">
      <PageHeader title={t("runs.title")} />

      <Panel title={t("runs.list")}>
        {runs.length === 0 ? <Empty text={t("runs.empty")} /> : (
          <DataTable
            head={[t("runs.code"), t("runs.machine"), t("runs.status"), t("runs.start"), t("runs.end")]}
            rows={runs.map((r) => [
              <span key="c" className="num">{r.run_code}</span>, machineName.get(r.machine_id) ?? na,
              t(`runStatus.${r.status}`), date(r.started_at), date(r.ended_at),
            ])}
          />
        )}
      </Panel>

      <Panel title={t("runs.add")}>
        {errorKey && <Notice tone="stop" text={t(errorKey)} />}
        {!canEdit ? <Notice text={t("form.readOnly")} />
          : machines.length === 0 ? <Notice text={t("runs.noMachines")} />
          : (
            <FormGrid action={createRun} submit={t("form.add")}>
              <Field label={t("runs.code")} name="run_code" required maxLength={64} />
              <Select label={t("runs.machine")} name="machine_id" required
                options={machines.map((m) => ({ value: m.id, label: machineLabel(m) }))} />
            </FormGrid>
          )}
      </Panel>
    </div>
  );
}
