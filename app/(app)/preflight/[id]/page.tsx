import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getT } from "@/lib/i18n";
import { getSessionContext } from "@/server/context";
import { getEngineHealth } from "@/server/engine";
import { createSupabaseServer } from "@/lib/supabase/server";
import { approvePlan, requestEngineDecision } from "@/server/actions";
import { checkKnownLimits, type LimitInput } from "@/lib/preflight/known-limits";
import { DataTable, Notice, PageHeader, Panel } from "@/components/ui";

const APPROVABLE = ["READY_FOR_OPERATOR_REVIEW", "SHADOW_TEST_ONLY", "TEST_REQUIRED"];
const ERRORS = ["invalid", "forbidden", "failed", "notApprovable", "already", "locked",
  "engineNotConnected", "engineError", "engineKeyMissing", "engineKey", "engineContract", "stale"];
const tone = (s: string) => (s === "PASS" ? "text-teal" : s === "FAIL" ? "text-stop" : "text-caution");

export default async function PlanPreflight({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ e?: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { e } = await searchParams;
  const { t, locale } = await getT();
  const ctx = await getSessionContext();
  if (!ctx?.current) redirect("/dashboard");
  const orgId = ctx.current.organizationId;
  const supabase = await createSupabaseServer();
  const { data: planData } = await supabase.from("process_plans")
    .select("id, version, machine_id, recipe_version_id, product_target_id, feed_kg_h, screw_rpm, water_kg_h, steam_kg_h, cutter_rpm, zone_setpoints_c, screw_configuration, die, cutter, preflight_status, confidence_label, risk_categories, missing_inputs, preflight_at, proposed_test_parameter, proposed_test_current, proposed_test_proposed, proposed_test_unit, proposed_test_zone, proposed_test_observe_s, approved_by, approved_at")
    .eq("id", id).eq("organization_id", orgId).maybeSingle();
  if (!planData) notFound();
  const plan = planData as Record<string, unknown> & {
    machine_id: string; recipe_version_id: string; product_target_id: string | null; zone_setpoints_c: number[];
    preflight_status: string | null; approved_at: string | null; risk_categories: string[]; missing_inputs: string[];
  };
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

  const [machineRes, versionRes, limitsRes, targetRes, engine] = await Promise.all([
    supabase.from("machines").select("manufacturer, model, serial_number, configured_max_rpm, zone_count").eq("id", plan.machine_id).maybeSingle(),
    supabase.from("recipe_versions").select("version, status, recipe_id").eq("id", plan.recipe_version_id).maybeSingle(),
    supabase.from("machine_confirmed_limits").select("parameter, bound, value, unit, source").eq("machine_id", plan.machine_id),
    plan.product_target_id ? supabase.from("product_targets").select("name").eq("id", plan.product_target_id).maybeSingle() : Promise.resolve({ data: null }),
    getEngineHealth(),
  ]);
  const machine = machineRes.data as { manufacturer: string | null; model: string | null; serial_number: string | null; configured_max_rpm: number | null; zone_count: number | null } | null;
  const version = versionRes.data as { version: number; status: string; recipe_id: string } | null;
  const recipeRes = version ? await supabase.from("recipes").select("name").eq("id", version.recipe_id).maybeSingle() : { data: null };

  const known = checkKnownLimits({
    plan: {
      feed_kg_h: num(plan.feed_kg_h), screw_rpm: num(plan.screw_rpm), water_kg_h: num(plan.water_kg_h),
      steam_kg_h: num(plan.steam_kg_h), cutter_rpm: num(plan.cutter_rpm), zone_setpoints_c: (plan.zone_setpoints_c ?? []).map(Number),
    },
    machine: { configured_max_rpm: num(machine?.configured_max_rpm), zone_count: num(machine?.zone_count) },
    recipeStatus: version?.status ?? "UNKNOWN",
    limits: ((limitsRes.data ?? []) as LimitInput[]).map((l) => ({ ...l, value: Number(l.value) })),
  });

  const na = t("common.notAvailable");
  const fmt = new Intl.DateTimeFormat(locale === "pl" ? "pl-PL" : "en-GB", { dateStyle: "short", timeStyle: "short" });
  const machineLabel = machine ? [machine.manufacturer, machine.model, machine.serial_number].filter(Boolean).join(" ") || na : na;
  const approvable = plan.preflight_status !== null && APPROVABLE.includes(plan.preflight_status) && !plan.approved_at;
  const canApprove = ["ADMIN", "ENGINEER", "OPERATOR"].includes(ctx.current.role);
  const canAskEngine = ["ADMIN", "ENGINEER"].includes(ctx.current.role) && !plan.approved_at;
  const v = (x: unknown) => <span className="num">{x === null || x === undefined || x === "" ? na : String(x)}</span>;

  return (
    <div className="space-y-6">
      <PageHeader title={t("preflight.planTitle")}>
        <Link href="/preflight" className="rounded border border-line px-3 py-2 text-sm">{t("preflight.back")}</Link>
      </PageHeader>
      {e && ERRORS.includes(e) && <p className="text-sm text-stop">{t(`preflight.err.${e}`)}</p>}

      <Panel title={t("preflight.inputs")}>
        <DataTable head={[t("preflight.field"), t("preflight.valueCol")]} rows={[
          [t("preflight.productTarget"), (targetRes.data as { name: string } | null)?.name ?? na],
          [t("preflight.recipe"), version ? `${(recipeRes.data as { name: string } | null)?.name ?? "?"} v${version.version} (${t(`recipes.status.${version.status}`)})` : na],
          [t("preflight.machine"), machineLabel],
          [t("preflight.screwConfiguration"), v(plan.screw_configuration)], [t("preflight.die"), v(plan.die)], [t("preflight.cutter"), v(plan.cutter)],
          [t("preflight.feed"), v(plan.feed_kg_h)], [t("preflight.rpm"), v(plan.screw_rpm)], [t("preflight.water"), v(plan.water_kg_h)],
          [t("preflight.steam"), v(plan.steam_kg_h)], [t("preflight.cutterRpm"), v(plan.cutter_rpm)],
          [t("preflight.zones"), v((plan.zone_setpoints_c ?? []).join(", "))],
        ]} />
        <Notice text={t("common.plcNotice")} />
      </Panel>

      <Panel title={t("preflight.knownTitle")}>
        <p className="px-4 pt-4 text-sm">{t("preflight.knownOverall")}: <span className={`font-medium ${tone(known.overall)}`}>{t(`preflight.check.${known.overall}`)}</span></p>
        <Notice text={t("preflight.knownHint")} />
        <DataTable head={[t("preflight.checkCol"), t("preflight.statusCol"), t("preflight.detailCol")]}
          rows={known.checks.map((c) => [
            c.id === "LIMIT" ? `${t("preflight.checkId.LIMIT")}: ${c.parameter}` : t(`preflight.checkId.${c.id}`),
            <span key="s" className={tone(c.status)}>{t(`preflight.check.${c.status}`)}</span>,
            <span key="d" className="text-muted">
              {c.reason ? t(`preflight.reason.${c.reason}`) : ""}
              {c.limit !== undefined ? ` · ${t("preflight.limit")} ${c.limit}${c.unit ? ` ${c.unit}` : ""}` : ""}
              {c.values ? ` · ${t("preflight.values")} ${c.values.join(", ")}` : ""}
              {c.source ? ` · ${t(`console.sourceValue.${c.source}`)}` : ""}
            </span>,
          ])} />
        {known.notCheckableBeforeRun.length > 0 && (
          <Notice text={`${t("preflight.notCheckable")}: ${known.notCheckableBeforeRun.map((l) => `${l.parameter} ${l.bound} ${l.value} ${l.unit}`).join("; ")}`} />
        )}
      </Panel>

      <Panel title={t("preflight.engineTitle")}>
        {plan.preflight_status ? (
          <div className="space-y-1 px-4 py-4 text-sm">
            <p>{t("preflight.engineDecision")}: <span className="font-medium">{t(`dashboard.decision.${plan.preflight_status}`)}</span></p>
            {plan.preflight_at ? <p className="text-muted">{fmt.format(new Date(String(plan.preflight_at)))}</p> : null}
            {plan.missing_inputs?.length ? <p className="text-muted">{t("preflight.missingInputs")}: <span className="num">{plan.missing_inputs.join(", ")}</span></p> : null}
            {plan.confidence_label ? <p className="text-muted">{t("preflight.confidence")}: {String(plan.confidence_label)}</p> : null}
            {plan.risk_categories?.length ? <p className="text-muted">{t("preflight.risks")}: <span className="num">{plan.risk_categories.join(", ")}</span></p> : null}
            {plan.proposed_test_parameter ? <p className="text-muted">{t("preflight.proposedTest")}: <span className="num">
              {`${String(plan.proposed_test_parameter)}${plan.proposed_test_zone ? ` (${t("preflight.zone")} ${String(plan.proposed_test_zone)})` : ""}: ${String(plan.proposed_test_current)} → ${String(plan.proposed_test_proposed)} ${String(plan.proposed_test_unit ?? "")}, ${String(plan.proposed_test_observe_s)} s`}</span></p> : null}
          </div>
        ) : (
          <div className="px-4 py-4 text-sm">
            <p className="font-medium text-unknown">{na}</p>
            <p className="mt-1 text-muted">{engine.connected ? t("preflight.engineNotRun") : t("preflight.engineDisconnected")}</p>
          </div>
        )}
        {canAskEngine && engine.connected && (
          <form action={requestEngineDecision} className="border-t border-line px-4 py-3">
            <input type="hidden" name="plan_id" value={id} />
            <p className="mb-2 text-sm text-muted">{t("preflight.askEngineHint")}</p>
            <button className="rounded bg-teal px-3 py-2 text-sm font-medium text-ground">{t("preflight.askEngine")}</button>
          </form>
        )}
      </Panel>

      <Panel title={t("preflight.approvalTitle")}>
        {plan.approved_at ? (
          <p className="px-4 py-4 text-sm text-teal">{t("preflight.approved")} · <span className="num">{fmt.format(new Date(plan.approved_at))}</span></p>
        ) : approvable && canApprove ? (
          <form action={approvePlan} className="px-4 py-4">
            <input type="hidden" name="plan_id" value={id} />
            <p className="mb-3 text-sm text-muted">{t("preflight.approveHint")}</p>
            <button className="rounded bg-teal px-3 py-2 text-sm font-medium text-ground">{t("preflight.approve")}</button>
          </form>
        ) : (
          <Notice text={approvable ? t("form.readOnly") : t("preflight.approvalUnavailable")} />
        )}
      </Panel>
    </div>
  );
}
