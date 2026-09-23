import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n";
import { getSessionContext } from "@/server/context";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createMachine } from "@/server/actions";
import { DataTable, Empty, Field, FormGrid, Notice, PageHeader, Panel, Select, formErrorKey } from "@/components/ui";

type MachineRow = {
  id: string; site_id: string; manufacturer: string | null; model: string | null; serial_number: string | null;
  screw_diameter_mm: number | null; l_d: number | null; drive_power_kw: number | null;
  configured_max_rpm: number | null; configured_max_pressure_bar: number | null; zone_count: number | null;
};

export default async function MachinesPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { t } = await getT();
  const ctx = await getSessionContext();
  if (!ctx?.current) redirect("/dashboard");
  const orgId = ctx.current.organizationId;
  const canEdit = ctx.current.role === "ADMIN" || ctx.current.role === "ENGINEER";
  const errorKey = formErrorKey((await searchParams).e);

  const supabase = await createSupabaseServer();
  const [machinesRes, sitesRes] = await Promise.all([
    supabase.from("machines")
      .select("id, site_id, manufacturer, model, serial_number, screw_diameter_mm, l_d, drive_power_kw, configured_max_rpm, configured_max_pressure_bar, zone_count")
      .eq("organization_id", orgId).order("created_at", { ascending: false }),
    supabase.from("sites").select("id, name").eq("organization_id", orgId).order("name"),
  ]);
  const machines = (machinesRes.data ?? []) as MachineRow[];
  const sites = (sitesRes.data ?? []) as { id: string; name: string }[];
  const siteName = new Map(sites.map((s) => [s.id, s.name]));
  const na = t("common.notAvailable");
  const n = (v: number | null) => <span className="num">{v ?? na}</span>;

  return (
    <div className="space-y-6">
      <PageHeader title={t("machines.title")} />

      <Panel title={t("machines.list")}>
        {machines.length === 0 ? <Empty text={t("machines.empty")} /> : (
          <DataTable
            head={[t("machines.manufacturer"), t("machines.model"), t("machines.serial"), t("machines.site"),
              t("machines.screwDiameter"), t("machines.ld"), t("machines.power"), t("machines.maxRpm"),
              t("machines.maxPressure"), t("machines.zones")]}
            rows={machines.map((m) => [
              m.manufacturer ?? na, m.model ?? na, m.serial_number ?? na, siteName.get(m.site_id) ?? na,
              n(m.screw_diameter_mm), n(m.l_d), n(m.drive_power_kw), n(m.configured_max_rpm),
              n(m.configured_max_pressure_bar), n(m.zone_count),
            ])}
          />
        )}
      </Panel>

      <Panel title={t("machines.add")}>
        {errorKey && <Notice tone="stop" text={t(errorKey)} />}
        {!canEdit ? <Notice text={t("form.readOnly")} />
          : sites.length === 0 ? <Notice text={t("machines.noSites")} />
          : (
            <FormGrid action={createMachine} submit={t("form.add")}>
              <Select label={t("machines.site")} name="site_id" required
                options={sites.map((s) => ({ value: s.id, label: s.name }))} />
              <Field label={t("machines.manufacturer")} name="manufacturer" />
              <Field label={t("machines.model")} name="model" />
              <Field label={t("machines.variant")} name="variant" />
              <Field label={t("machines.serial")} name="serial_number" />
              <Field label={t("machines.screwDiameter")} name="screw_diameter_mm" type="number" step="any" min={0} />
              <Field label={t("machines.ld")} name="l_d" type="number" step="any" min={0} />
              <Field label={t("machines.power")} name="drive_power_kw" type="number" step="any" min={0} />
              <Field label={t("machines.maxRpm")} name="configured_max_rpm" type="number" step="any" min={0} />
              <Field label={t("machines.maxPressure")} name="configured_max_pressure_bar" type="number" step="any" min={0} />
              <Field label={t("machines.zones")} name="zone_count" type="number" step="1" min={1} max={64} />
            </FormGrid>
          )}
      </Panel>
    </div>
  );
}
