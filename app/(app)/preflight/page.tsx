import Link from "next/link";
import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n";
import { getSessionContext } from "@/server/context";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createProcessPlan } from "@/server/actions";
import { DataTable, Empty, Field, Notice, PageHeader, Panel, Select, formErrorKey } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { SetupSteps } from "@/components/setup-steps";
import { nextSetupStep, setupSteps } from "@/lib/wizard/steps";
import { setupCounts } from "@/server/setup";

type Plan = { id: string; version: number; machine_id: string; recipe_version_id: string; preflight_status: string | null; approved_at: string | null; created_at: string };
type Machine = { id: string; manufacturer: string | null; model: string | null; serial_number: string | null };
type Version = { id: string; version: number; status: string; recipe_id: string };
type Recipe = { id: string; name: string };
type Target = { id: string; name: string };

// Wizard: product -> recipe -> machine -> configuration -> plan -> PREFLIGHT.
export default async function PreflightIndex({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { t, locale } = await getT();
  const ctx = await getSessionContext();
  if (!ctx?.current) redirect("/dashboard");
  const orgId = ctx.current.organizationId;
  const errorKey = formErrorKey((await searchParams).e);
  const supabase = await createSupabaseServer();
  const [plansRes, machinesRes, versionsRes, recipesRes, targetsRes, counts] = await Promise.all([
    supabase.from("process_plans").select("id, version, machine_id, recipe_version_id, preflight_status, approved_at, created_at")
      .eq("organization_id", orgId).order("created_at", { ascending: false }).limit(50),
    supabase.from("machines").select("id, manufacturer, model, serial_number").eq("organization_id", orgId),
    supabase.from("recipe_versions").select("id, version, status, recipe_id").eq("organization_id", orgId),
    supabase.from("recipes").select("id, name").eq("organization_id", orgId),
    supabase.from("product_targets").select("id, name").eq("organization_id", orgId),
    setupCounts(supabase, orgId),
  ]);
  const plans = (plansRes.data ?? []) as Plan[];
  const machines = (machinesRes.data ?? []) as Machine[];
  const versions = (versionsRes.data ?? []) as Version[];
  const recipeName = new Map(((recipesRes.data ?? []) as Recipe[]).map((r) => [r.id, r.name]));
  const targets = (targetsRes.data ?? []) as Target[];
  const machineLabel = (m: Machine) => [m.manufacturer, m.model, m.serial_number].filter(Boolean).join(" ") || m.id.slice(0, 8);
  const machineName = new Map(machines.map((m) => [m.id, machineLabel(m)]));
  const versionLabel = (v: Version) => `${recipeName.get(v.recipe_id) ?? "?"} v${v.version}`;
  const versionName = new Map(versions.map((v) => [v.id, versionLabel(v)]));
  const finalVersions = versions.filter((v) => v.status === "FINAL");
  const canEdit = ctx.current.role === "ADMIN" || ctx.current.role === "ENGINEER";
  const na = t("common.notAvailable");
  const fmt = new Intl.DateTimeFormat(locale === "pl" ? "pl-PL" : "en-GB", { dateStyle: "short", timeStyle: "short" });

  const step = (n: number, label: string, children: React.ReactNode) => (
    <fieldset className="space-y-3 border-t border-line px-4 py-4">
      <legend className="px-1 text-sm font-medium"><span className="num text-teal">{n}.</span> {label}</legend>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </fieldset>
  );

  return (
    <div className="space-y-6">
      <PageHeader title={t("preflight.title")} />
      <p className="text-sm text-muted">{t("preflight.intro")}</p>
      {nextSetupStep(counts) && (
        <SetupSteps steps={setupSteps(counts)} title={t("setup.title")} doneLabel={t("setup.done")} todoLabel={t("setup.todo")}
          labels={{ product: t("setup.product"), site: t("setup.site"), machine: t("setup.machine"), material: t("setup.material"), recipe: t("setup.recipe") }} />
      )}

      <Panel title={t("preflight.plans")}>
        {plans.length === 0 ? <Empty text={t("preflight.noPlans")} /> : (
          <DataTable head={[t("preflight.machine"), t("preflight.recipe"), t("preflight.engineDecision"), t("preflight.approval"), t("preflight.created"), ""]}
            rows={plans.map((p) => [
              machineName.get(p.machine_id) ?? na, versionName.get(p.recipe_version_id) ?? na,
              p.preflight_status ? t(`dashboard.decision.${p.preflight_status}`) : na,
              p.approved_at ? t("preflight.approved") : t("preflight.notApproved"),
              <span key="c" className="num">{fmt.format(new Date(p.created_at))}</span>,
              <Link key="o" href={`/preflight/${p.id}`} className="text-teal hover:underline">{t("preflight.open")}</Link>,
            ])} />
        )}
      </Panel>

      <Panel title={t("preflight.wizard")}>
        {errorKey && <Notice tone="stop" text={t(errorKey)} />}
        {!canEdit ? <Notice text={t("form.readOnly")} />
          : machines.length === 0 ? <Notice text={t("preflight.needMachine")} />
          : finalVersions.length === 0 ? <Notice text={t("preflight.needFinalRecipe")} />
          : (
            <form action={createProcessPlan}>
              {step(1, t("preflight.stepProduct"), (
                <Select label={t("preflight.productTarget")} name="product_target_id" empty={t("common.none")}
                  options={targets.map((tg) => ({ value: tg.id, label: tg.name }))} />
              ))}
              {step(2, t("preflight.stepRecipe"), (
                <Select label={t("preflight.recipe")} name="recipe_version_id" required
                  options={finalVersions.map((v) => ({ value: v.id, label: versionLabel(v) }))} />
              ))}
              {step(3, t("preflight.stepMachine"), (
                <Select label={t("preflight.machine")} name="machine_id" required
                  options={machines.map((m) => ({ value: m.id, label: machineLabel(m) }))} />
              ))}
              {step(4, t("preflight.stepConfiguration"), (<>
                <Field label={t("preflight.screwConfiguration")} name="screw_configuration" maxLength={500} />
                <Field label={t("preflight.die")} name="die" maxLength={200} />
                <Field label={t("preflight.cutter")} name="cutter" maxLength={200} />
              </>))}
              {step(5, t("preflight.stepPlan"), (<>
                <Field label={t("preflight.feed")} name="feed_kg_h" type="number" step="any" min={0} />
                <Field label={t("preflight.rpm")} name="screw_rpm" type="number" step="any" min={0} />
                <Field label={t("preflight.water")} name="water_kg_h" type="number" step="any" min={0} />
                <Field label={t("preflight.steam")} name="steam_kg_h" type="number" step="any" min={0} />
                <Field label={t("preflight.cutterRpm")} name="cutter_rpm" type="number" step="any" min={0} />
                <Field label={t("preflight.zones")} name="zone_setpoints_c" maxLength={400} />
              </>))}
              <div className="border-t border-line px-4 py-4">
                <p className="mb-3 text-sm text-muted">{t("common.plcNotice")}</p>
                <SubmitButton label={t("preflight.create")} />
              </div>
            </form>
          )}
      </Panel>
    </div>
  );
}
