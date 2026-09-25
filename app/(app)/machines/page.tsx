import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n";
import { getSessionContext } from "@/server/context";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createMachine, createSensorTag, createSignalDefinition } from "@/server/actions";
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
  const [machinesRes, sitesRes, signalsRes, tagsRes] = await Promise.all([
    supabase.from("machines")
      .select("id, site_id, manufacturer, model, serial_number, screw_diameter_mm, l_d, drive_power_kw, configured_max_rpm, configured_max_pressure_bar, zone_count")
      .eq("organization_id", orgId).order("created_at", { ascending: false }),
    supabase.from("sites").select("id, name").eq("organization_id", orgId).order("name"),
    supabase.from("signal_definitions").select("code, category, canonical_unit, description")
      .eq("organization_id", orgId).order("code"),
    supabase.from("machine_sensor_tags").select("id, machine_id, tag, signal, unit")
      .eq("organization_id", orgId).order("tag"),
  ]);
  const signals = (signalsRes.data ?? []) as
    { code: string; category: string; canonical_unit: string | null; description: string | null }[];
  const tags = (tagsRes.data ?? []) as
    { id: string; machine_id: string; tag: string; signal: string | null; unit: string | null }[];
  const machines = (machinesRes.data ?? []) as MachineRow[];
  const sites = (sitesRes.data ?? []) as { id: string; name: string }[];
  const siteName = new Map(sites.map((s) => [s.id, s.name]));
  const na = t("common.notAvailable");
  const n = (v: number | null) => <span className="num">{v ?? na}</span>;
  const machineLabel = (m: MachineRow) =>
    [m.manufacturer, m.model, m.serial_number].filter(Boolean).join(" ") || m.id.slice(0, 8);
  const machineName = new Map(machines.map((m) => [m.id, machineLabel(m)]));
  const categories = ["PROCESS", "MATERIAL", "PRODUCT", "MACHINE_STATE"];

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

      <Panel title={t("signals.title")}>
        {signals.length === 0 ? <Empty text={t("signals.empty")} /> : (
          <DataTable head={[t("signals.code"), t("signals.category"), t("signals.unit"), t("signals.description")]}
            rows={signals.map((sg) => [
              <span key="c" className="num">{sg.code}</span>, t(`signals.cat.${sg.category}`),
              sg.canonical_unit ?? na, sg.description ?? na,
            ])} />
        )}
        {canEdit && (
          <div className="border-t border-line">
            <FormGrid action={createSignalDefinition} submit={t("signals.add")}>
              <Field label={t("signals.code")} name="code" required maxLength={64} />
              <Select label={t("signals.category")} name="category" required
                options={categories.map((c) => ({ value: c, label: t(`signals.cat.${c}`) }))} />
              <Field label={t("signals.unit")} name="canonical_unit" maxLength={32} />
              <Field label={t("signals.description")} name="description" maxLength={500} />
            </FormGrid>
          </div>
        )}
      </Panel>

      <Panel title={t("tags.title")}>
        {tags.length === 0 ? <Empty text={t("tags.empty")} /> : (
          <DataTable head={[t("tags.machine"), t("tags.tag"), t("tags.signal"), t("tags.unit")]}
            rows={tags.map((tg) => [
              machineName.get(tg.machine_id) ?? na, <span key="t" className="num">{tg.tag}</span>,
              tg.signal ?? t("tags.unmapped"), tg.unit ?? na,
            ])} />
        )}
        {canEdit && (
          <div className="border-t border-line">
            {machines.length === 0 ? <Notice text={t("runs.noMachines")} />
              : signals.length === 0 ? <Notice text={t("tags.noSignals")} />
              : (
                <FormGrid action={createSensorTag} submit={t("tags.add")}>
                  <Select label={t("tags.machine")} name="machine_id" required
                    options={machines.map((m) => ({ value: m.id, label: machineLabel(m) }))} />
                  <Field label={t("tags.tag")} name="tag" required />
                  <Select label={t("tags.signal")} name="signal" required
                    options={signals.map((sg) => ({ value: sg.code, label: sg.code }))} />
                  <Field label={t("tags.unit")} name="unit" maxLength={32} />
                </FormGrid>
              )}
          </div>
        )}
      </Panel>
    </div>
  );
}
