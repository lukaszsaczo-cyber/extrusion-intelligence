"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServer } from "@/lib/supabase/server";
import { LOCALE_COOKIE, isLocale } from "@/lib/i18n";
import { getSessionContext } from "@/server/context";
import { parseInstant } from "@/lib/runs/instant";
import { STEPS } from "@/lib/fail-loop/steps";
import { logServerError } from "@/lib/log/server-error";
import { buildPreflightRequest, toDecisionWrite, toVerificationWrite } from "@/lib/engine/results";
import { analyzePreflight, engineConfigured, engineWriteKey, verifyRun } from "@/server/engine";

export async function setLocale(formData: FormData) {
  const v = formData.get("locale");
  if (!isLocale(v)) return;
  (await cookies()).set(LOCALE_COOKIE, v, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/", "layout");
}

export async function signOut() {
  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();
  redirect("/login");
}

const OrgName = z.string().trim().min(1).max(200);

export async function createOrganization(formData: FormData) {
  const parsed = OrgName.safeParse(formData.get("name"));
  if (!parsed.success) redirect("/dashboard?e=invalid");
  const supabase = await createSupabaseServer();
  // Existing SECURITY DEFINER RPC: caller becomes ADMIN. No direct INSERT exists.
  const { error } = await supabase.rpc("create_organization", { org_name: parsed.data });
  if (error) {
    logServerError("createOrganization", error);
    redirect("/dashboard?e=failed");
  }
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

// ---- Organization data (every write goes through the user's session; RLS decides) ----

const text = (max = 200) => z.string().trim().min(1).max(max);
const optText = (max = 200) =>
  z.string().trim().max(max).transform((v) => (v === "" ? null : v)).nullable().default(null);
const optPositive = z
  .string().trim()
  .transform((v) => (v === "" ? null : Number(v)))
  .refine((v) => v === null || (Number.isFinite(v) && v > 0))
  .nullable().default(null);
const uuid = z.string().uuid();

function fields(formData: FormData, keys: string[]) {
  return Object.fromEntries(keys.map((k) => [k, formData.get(k) ?? undefined]));
}

// Database guard messages start with a stable token (0014); anything else is generic.
const GUARD_ERRORS: [string, string][] = [
  ["run_not_approved", "notApproved"], ["run_locked", "locked"], ["plan_locked", "locked"],
  ["run_transition", "transition"], ["run_machine", "machine"], ["run_time", "time"],
];
function errorCode(error: { code?: string; message?: string }): string {
  if (error.code === "42501") return "forbidden";
  if (error.code === "23505") return "duplicate";
  const hit = GUARD_ERRORS.find(([token]) => error.message?.startsWith(token));
  return hit ? hit[1] : "failed";
}

// Inserts one row into the caller's current organization and returns to `path`
// with ?e=invalid|forbidden|failed on error. Organization id never comes from the form.
async function insertForOrg(path: string, table: string, row: Record<string, unknown> | null) {
  if (!row) redirect(`${path}?e=invalid`);
  const ctx = await getSessionContext();
  if (!ctx?.current) redirect("/dashboard");
  const supabase = await createSupabaseServer();
  const { error } = await supabase.from(table).insert({ ...row, organization_id: ctx.current.organizationId });
  if (error) {
    logServerError(`insert:${table}`, error);
    redirect(`${path}?e=${errorCode(error)}`);
  }
  revalidatePath(path);
  redirect(path);
}

const SiteInput = z.object({ name: text(), timezone: optText(64) });

export async function createSite(formData: FormData) {
  const p = SiteInput.safeParse(fields(formData, ["name", "timezone"]));
  await insertForOrg("/settings", "sites", p.success ? p.data : null);
}

const MachineInput = z.object({
  site_id: uuid,
  manufacturer: optText(), model: optText(), variant: optText(), serial_number: optText(),
  screw_diameter_mm: optPositive, l_d: optPositive, drive_power_kw: optPositive,
  configured_max_rpm: optPositive, configured_max_pressure_bar: optPositive,
  zone_count: z.string().trim()
    .transform((v) => (v === "" ? null : Number(v)))
    .refine((v) => v === null || (Number.isInteger(v) && v >= 1 && v <= 64))
    .nullable().default(null),
});

export async function createMachine(formData: FormData) {
  const p = MachineInput.safeParse(fields(formData, Object.keys(MachineInput.shape)));
  await insertForOrg("/machines", "machines", p.success ? p.data : null);
}

const MaterialInput = z.object({ name: text(), supplier: optText() });

export async function createMaterial(formData: FormData) {
  const p = MaterialInput.safeParse(fields(formData, ["name", "supplier"]));
  await insertForOrg("/materials", "materials", p.success ? p.data : null);
}

const RecipeInput = z.object({ name: text(), product_type: optText() });

export async function createRecipe(formData: FormData) {
  const p = RecipeInput.safeParse(fields(formData, ["name", "product_type"]));
  await insertForOrg("/recipes", "recipes", p.success ? p.data : null);
}

const optUuid = z.string().trim().transform((v) => (v === "" ? null : v)).pipe(uuid.nullable()).nullable().default(null);
const RunInput = z.object({ machine_id: uuid, run_code: text(64), process_plan_id: optUuid });

// A run is created PLANNED. The database (0014) checks that a linked plan is
// for the same machine; starting needs an approved plan.
export async function createRun(formData: FormData) {
  const p = RunInput.safeParse(fields(formData, ["machine_id", "run_code", "process_plan_id"]));
  await insertForOrg("/runs", "runs", p.success ? p.data : null);
}

const SignalInput = z.object({
  code: z.string().trim().regex(/^[a-z][a-z0-9_]{0,63}$/),
  category: z.enum(["PROCESS", "MATERIAL", "PRODUCT", "MACHINE_STATE"]),
  canonical_unit: optText(32),
  description: optText(500),
});

export async function createSignalDefinition(formData: FormData) {
  const p = SignalInput.safeParse(fields(formData, Object.keys(SignalInput.shape)));
  await insertForOrg("/machines", "signal_definitions", p.success ? p.data : null);
}

const TagInput = z.object({
  machine_id: uuid,
  tag: text(200),
  signal: z.string().trim().regex(/^[a-z][a-z0-9_]{0,63}$/),
  unit: optText(32),
});

export async function createSensorTag(formData: FormData) {
  const p = TagInput.safeParse(fields(formData, Object.keys(TagInput.shape)));
  await insertForOrg("/machines", "machine_sensor_tags", p.success ? p.data : null);
}

const LimitInput = z.object({
  machine_id: uuid,
  parameter: text(64),
  bound: z.enum(["MIN", "MAX"]),
  value: z.string().trim().min(1).transform(Number).refine(Number.isFinite),
  unit: text(32),
  source: z.enum(["CATALOG", "CONFIRMED_ON_MACHINE"]),
});

// A limit marked CONFIRMED_ON_MACHINE records who confirmed it and when (the
// database requires both); a CATALOG limit carries neither.
export async function createMachineLimit(formData: FormData) {
  const p = LimitInput.safeParse(fields(formData, Object.keys(LimitInput.shape)));
  if (!p.success) return insertForOrg("/machine-console", "machine_confirmed_limits", null);
  const ctx = await getSessionContext();
  const confirmed = p.data.source === "CONFIRMED_ON_MACHINE" && ctx
    ? { confirmed_by: ctx.userId, confirmed_at: new Date().toISOString() }
    : {};
  await insertForOrg(`/machine-console/${p.data.machine_id}`, "machine_confirmed_limits", { ...p.data, ...confirmed });
}

export async function renameOrganization(formData: FormData) {
  const p = OrgName.safeParse(formData.get("name"));
  if (!p.success) redirect("/settings?e=invalid");
  const ctx = await getSessionContext();
  if (!ctx?.current) redirect("/dashboard");
  const supabase = await createSupabaseServer();
  // RLS lets only ADMIN update; a non-admin update matches 0 rows, so ask for the row back.
  const { data, error } = await supabase.from("organizations")
    .update({ name: p.data }).eq("id", ctx.current.organizationId).select("id");
  if (error) {
    logServerError("renameOrganization", error);
    redirect("/settings?e=failed");
  }
  if (!data?.length) {
    logServerError("renameOrganization", null, { reason: "no_rows" });
    redirect("/settings?e=forbidden");
  }
  revalidatePath("/", "layout");
  redirect("/settings");
}

// ---- Stage 5: recipes, product targets, process plans, approval ----

const optNonNegative = z
  .string().trim()
  .transform((v) => (v === "" ? null : Number(v)))
  .refine((v) => v === null || (Number.isFinite(v) && v >= 0))
  .nullable().default(null);
const optNumber = z
  .string().trim()
  .transform((v) => (v === "" ? null : Number(v)))
  .refine((v) => v === null || Number.isFinite(v))
  .nullable().default(null);

// Next version number for a recipe; the unique (recipe_id, version) constraint
// rejects a concurrent duplicate instead of silently reusing a number.
export async function createRecipeVersion(formData: FormData) {
  const p = uuid.safeParse(formData.get("recipe_id"));
  if (!p.success) return insertForOrg("/recipes", "recipe_versions", null);
  const supabase = await createSupabaseServer();
  const { data } = await supabase.from("recipe_versions").select("version").eq("recipe_id", p.data)
    .order("version", { ascending: false }).limit(1).maybeSingle();
  await insertForOrg(`/recipes/${p.data}`, "recipe_versions", { recipe_id: p.data, version: ((data?.version as number | undefined) ?? 0) + 1 });
}

const ComponentInput = z.object({
  recipe_id: uuid, recipe_version_id: uuid, material_id: uuid,
  percent_wet: z.string().trim().min(1).transform(Number).refine((v) => Number.isFinite(v) && v > 0 && v <= 100),
});

export async function addRecipeComponent(formData: FormData) {
  const p = ComponentInput.safeParse(fields(formData, Object.keys(ComponentInput.shape)));
  if (!p.success) return insertForOrg("/recipes", "recipe_components", null);
  const { recipe_id, ...row } = p.data;
  await insertForOrg(`/recipes/${recipe_id}`, "recipe_components", row);
}

// FINAL is enforced by the database: components must sum to 100 % and a FINAL
// version can no longer change.
export async function finalizeRecipeVersion(formData: FormData) {
  const p = z.object({ recipe_id: uuid, recipe_version_id: uuid }).safeParse(fields(formData, ["recipe_id", "recipe_version_id"]));
  if (!p.success) redirect("/recipes?e=invalid");
  const back = `/recipes/${p.data.recipe_id}`;
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.from("recipe_versions").update({ status: "FINAL" })
    .eq("id", p.data.recipe_version_id).select("id");
  if (error) {
    logServerError("finalizeRecipeVersion", error);
    redirect(`${back}?e=${error.message.includes("sum to 100") ? "sum" : error.code === "42501" ? "forbidden" : "failed"}`);
  }
  if (!data?.length) {
    logServerError("finalizeRecipeVersion", null, { reason: "no_rows" });
    redirect(`${back}?e=forbidden`);
  }
  revalidatePath(back);
  redirect(back);
}

const TargetInput = z.object({ name: text(), product_type: optText(), shape: optText() });

export async function createProductTarget(formData: FormData) {
  const p = TargetInput.safeParse(fields(formData, Object.keys(TargetInput.shape)));
  await insertForOrg("/new-product", "product_targets", p.success ? p.data : null);
}

const TargetValueInput = z.object({
  product_target_id: uuid, parameter: text(64), unit: optText(32),
  min_value: optNumber, target_value: optNumber, max_value: optNumber,
  priority: z.string().trim().transform((v) => (v === "" ? null : v))
    .pipe(z.enum(["LOW", "MEDIUM", "HIGH"]).nullable()).nullable().default(null),
}).refine((v) => v.min_value !== null || v.target_value !== null || v.max_value !== null);

export async function addTargetValue(formData: FormData) {
  const p = TargetValueInput.safeParse(fields(formData, ["product_target_id", "parameter", "unit", "min_value", "target_value", "max_value", "priority"]));
  await insertForOrg("/new-product", "product_target_values", p.success ? p.data : null);
}

const zoneList = z.string().trim()
  .transform((v) => (v === "" ? [] : v.split(/[;,\s]+/).filter(Boolean).map(Number)))
  .refine((a) => a.length <= 64 && a.every((x) => Number.isFinite(x)));

const PlanInput = z.object({
  product_target_id: z.string().trim().transform((v) => (v === "" ? null : v)).pipe(uuid.nullable()),
  recipe_version_id: uuid, machine_id: uuid,
  screw_configuration: optText(500), die: optText(200), cutter: optText(200),
  feed_kg_h: optNonNegative, screw_rpm: optNonNegative, water_kg_h: optNonNegative,
  steam_kg_h: optNonNegative, cutter_rpm: optNonNegative, zone_setpoints_c: zoneList,
});

// Creates the plan only. Preflight and approval fields are server-only in the
// database (plan_guard); the user's session cannot set them.
export async function createProcessPlan(formData: FormData) {
  const p = PlanInput.safeParse(fields(formData, Object.keys(PlanInput.shape)));
  if (!p.success) redirect("/preflight?e=invalid");
  const ctx = await getSessionContext();
  if (!ctx?.current) redirect("/dashboard");
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.from("process_plans")
    .insert({ ...p.data, organization_id: ctx.current.organizationId }).select("id").single();
  if (error || !data) {
    logServerError("createProcessPlan", error, error ? undefined : { reason: "no_row" });
    redirect(`/preflight?e=${error?.code === "42501" ? "forbidden" : "failed"}`);
  }
  revalidatePath("/preflight");
  redirect(`/preflight/${data.id}`);
}

// Approval goes only through the database function, which re-checks role,
// organization, an approvable engine decision and that it is not yet approved.
export async function approvePlan(formData: FormData) {
  const p = uuid.safeParse(formData.get("plan_id"));
  if (!p.success) redirect("/preflight?e=invalid");
  const back = `/preflight/${p.data}`;
  const supabase = await createSupabaseServer();
  const { error } = await supabase.rpc("approve_process_plan", { plan: p.data });
  if (error) {
    logServerError("approvePlan", error);
    const m = error.message;
    redirect(`${back}?e=${m.includes("forbidden") ? "forbidden" : m.includes("not available") ? "notApprovable" : m.includes("already") ? "already" : "failed"}`);
  }
  revalidatePath(back);
  redirect(back);
}

// ---- Stage 6: product samples and measurements (append-only evidence) ----

const SampleInput = z.object({
  run_id: uuid, sample_code: text(64),
  taken_at: z.string().trim().transform((v) => (v === "" ? null : v))
    .refine((v) => v === null || !Number.isNaN(Date.parse(v))).transform((v) => (v === null ? null : new Date(v).toISOString()))
    .nullable().default(null),
});

export async function createProductSample(formData: FormData) {
  const p = SampleInput.safeParse(fields(formData, Object.keys(SampleInput.shape)));
  if (!p.success) return insertForOrg("/runs", "product_samples", null);
  await insertForOrg(`/runs/${p.data.run_id}`, "product_samples", p.data);
}

const MeasurementInput = z.object({
  run_id: uuid, product_sample_id: uuid, parameter: text(64),
  value: z.string().trim().min(1).transform(Number).refine(Number.isFinite),
  unit: optText(32), method: optText(200),
});

// Measurements cannot be edited or deleted (0012); a wrong value is corrected
// by recording a new measurement.
export async function addMeasurement(formData: FormData) {
  const p = MeasurementInput.safeParse(fields(formData, Object.keys(MeasurementInput.shape)));
  if (!p.success) return insertForOrg("/runs", "product_measurements", null);
  const { run_id, ...row } = p.data;
  await insertForOrg(`/runs/${run_id}`, "product_measurements", row);
}

// ---- Stage 7: audit seal ----

// The database builds the snapshot and its hash (seal_run_audit, 0013) and
// re-checks the role; the app only names the run.
export async function sealRunAudit(formData: FormData) {
  const p = uuid.safeParse(formData.get("run_id"));
  if (!p.success) redirect("/audit?e=invalid");
  const back = `/runs/${p.data}`;
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.rpc("seal_run_audit", { p_run_id: p.data });
  if (error || typeof data !== "string") {
    logServerError("sealRunAudit", error, error ? undefined : { reason: "no_id" });
    redirect(`${back}?e=${error?.code === "42501" ? "forbidden" : "failed"}`);
  }
  revalidatePath("/audit");
  redirect(`/audit/${data}`);
}

// ---- Run lifecycle: PLANNED -> RUNNING -> COMPLETED | ABORTED (rules enforced by 0014) ----

// Optional time with an explicit offset; empty = now (lib/runs/instant.ts).
const optInstant = z.string().transform((v, ctx) => {
  const at = parseInstant(v, new Date());
  if (at === null) { ctx.addIssue({ code: z.ZodIssueCode.custom }); return z.NEVER; }
  return at;
});

const runBack = (formData: FormData) => {
  const id = uuid.safeParse(formData.get("run_id"));
  return id.success ? `/runs/${id.data}` : "/runs";
};

async function updateRun(runId: string, patch: Record<string, unknown>) {
  const back = `/runs/${runId}`;
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.from("runs").update(patch).eq("id", runId).select("id");
  if (error) {
    logServerError("updateRun", error);
    redirect(`${back}?e=${errorCode(error)}`);
  }
  if (!data?.length) {
    logServerError("updateRun", null, { reason: "no_rows" });
    redirect(`${back}?e=forbidden`);
  }
  revalidatePath(back);
  redirect(back);
}

const RunPlanInput = z.object({ run_id: uuid, process_plan_id: optUuid });

export async function setRunPlan(formData: FormData) {
  const p = RunPlanInput.safeParse(fields(formData, ["run_id", "process_plan_id"]));
  if (!p.success) redirect("/runs?e=invalid");
  await updateRun(p.data.run_id, { process_plan_id: p.data.process_plan_id });
}

const StartInput = z.object({ run_id: uuid, at: optInstant });

export async function startRun(formData: FormData) {
  const p = StartInput.safeParse(fields(formData, ["run_id", "at"]));
  if (!p.success) redirect(`${runBack(formData)}?e=${parseInstant(String(formData.get("at") ?? ""), new Date()) === null ? "time" : "invalid"}`);
  await updateRun(p.data.run_id, { status: "RUNNING", started_at: p.data.at });
}

const EndInput = z.object({ run_id: uuid, outcome: z.enum(["COMPLETED", "ABORTED"]), at: optInstant });

export async function endRun(formData: FormData) {
  const p = EndInput.safeParse(fields(formData, ["run_id", "outcome", "at"]));
  if (!p.success) redirect(`${runBack(formData)}?e=${parseInstant(String(formData.get("at") ?? ""), new Date()) === null ? "time" : "invalid"}`);
  await updateRun(p.data.run_id, { status: p.data.outcome, ended_at: p.data.at });
}

// A run that never started is cancelled without times.
export async function cancelPlannedRun(formData: FormData) {
  const p = uuid.safeParse(formData.get("run_id"));
  if (!p.success) redirect("/runs?e=invalid");
  await updateRun(p.data, { status: "ABORTED" });
}

// ---- Engine results: decision and verification (0015/0016) ----
// The engine answers through the contract's adapter (sanitized there); the
// database stores it only with the server's engine write key and only in the
// contract's shape. Engine not configured -> nothing is requested or stored.

const ENGINE_ERRORS: [string, string][] = [
  ["engine_key", "engineKey"], ["engine_stale", "stale"], ["engine_locked", "already"],
  ["engine_contract", "engineContract"], ["engine_run_not_completed", "notCompleted"],
];
const engineErrorCode = (error: { code?: string; message?: string }) =>
  ENGINE_ERRORS.find(([token]) => error.message?.startsWith(token))?.[1] ?? (error.code === "42501" ? "forbidden" : "failed");

export async function requestEngineDecision(formData: FormData) {
  const p = uuid.safeParse(formData.get("plan_id"));
  if (!p.success) redirect("/preflight?e=invalid");
  const back = `/preflight/${p.data}`;
  const ctx = await getSessionContext();
  if (!ctx?.current) redirect("/dashboard");
  if (!["ADMIN", "ENGINEER"].includes(ctx.current.role)) redirect(`${back}?e=forbidden`);
  if (!engineConfigured()) redirect(`${back}?e=engineNotConnected`);
  const supabase = await createSupabaseServer();
  const { data: plan } = await supabase.from("process_plans")
    .select("id, version, updated_at, machine_id, recipe_version_id, product_target_id, feed_kg_h, screw_rpm, water_kg_h, steam_kg_h, cutter_rpm, zone_setpoints_c, screw_configuration, die, cutter")
    .eq("id", p.data).eq("organization_id", ctx.current.organizationId).maybeSingle();
  if (!plan) redirect(`${back}?e=invalid`);
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  const [machineRes, versionRes, compRes, targetRes, limitRes] = await Promise.all([
    supabase.from("machines").select("id, manufacturer, model, screw_diameter_mm, l_d, drive_power_kw, configured_max_rpm, configured_max_pressure_bar, zone_count").eq("id", plan.machine_id).maybeSingle(),
    supabase.from("recipe_versions").select("id, version, status").eq("id", plan.recipe_version_id).maybeSingle(),
    supabase.from("recipe_components").select("percent_wet, material_id").eq("recipe_version_id", plan.recipe_version_id),
    plan.product_target_id ? supabase.from("product_target_values").select("parameter, unit, min_value, target_value, max_value").eq("product_target_id", plan.product_target_id) : Promise.resolve({ data: [] }),
    supabase.from("machine_confirmed_limits").select("parameter, bound, value, unit, source").eq("machine_id", plan.machine_id),
  ]);
  const components = (compRes.data ?? []) as { percent_wet: unknown; material_id: string }[];
  const matRes = components.length
    ? await supabase.from("materials").select("id, name").in("id", components.map((c) => c.material_id))
    : { data: [] };
  const materialName = new Map(((matRes.data ?? []) as { id: string; name: string }[]).map((x) => [x.id, x.name]));
  const m = machineRes.data as Record<string, unknown> | null;
  const v = versionRes.data as { id: string; version: number; status: string } | null;
  const request = buildPreflightRequest({
    plan: {
      id: plan.id, version: plan.version, feed_kg_h: num(plan.feed_kg_h), screw_rpm: num(plan.screw_rpm), water_kg_h: num(plan.water_kg_h),
      steam_kg_h: num(plan.steam_kg_h), cutter_rpm: num(plan.cutter_rpm), zone_setpoints_c: ((plan.zone_setpoints_c ?? []) as unknown[]).map(Number),
      screw_configuration: plan.screw_configuration, die: plan.die, cutter: plan.cutter,
    },
    machine: m ? {
      id: String(m.id), manufacturer: (m.manufacturer as string | null) ?? null, model: (m.model as string | null) ?? null,
      screw_diameter_mm: num(m.screw_diameter_mm), l_d: num(m.l_d), drive_power_kw: num(m.drive_power_kw),
      configured_max_rpm: num(m.configured_max_rpm), configured_max_pressure_bar: num(m.configured_max_pressure_bar), zone_count: num(m.zone_count),
    } : null,
    recipe: v ? {
      version_id: v.id, version: v.version, status: v.status,
      components: components.map((c) => ({ material: materialName.get(c.material_id) ?? c.material_id, percent_wet: Number(c.percent_wet) })),
    } : null,
    targets: ((targetRes.data ?? []) as { parameter: string; unit: string | null; min_value: unknown; target_value: unknown; max_value: unknown }[])
      .map((t) => ({ parameter: t.parameter, unit: t.unit, min: num(t.min_value), target: num(t.target_value), max: num(t.max_value) })),
    limits: ((limitRes.data ?? []) as { parameter: string; bound: string; value: unknown; unit: string; source: string }[])
      .map((l) => ({ parameter: l.parameter, bound: l.bound, value: Number(l.value), unit: l.unit, source: l.source })),
  });
  const answer = await analyzePreflight(request);
  if (!answer.ok) {
    logServerError("requestEngineDecision", null, { reason: "engine_answer", errorId: answer.error.errorId });
    redirect(`${back}?e=engineError`);
  }
  const write = toDecisionWrite(answer.result);
  if (!write) redirect(`${back}?e=engineNotConnected`);
  const key = engineWriteKey();
  if (!key) redirect(`${back}?e=engineKeyMissing`);
  const { error } = await supabase.rpc("record_engine_decision", {
    p_key: key, p_plan: plan.id, p_plan_updated_at: plan.updated_at, p_decision: write,
  });
  if (error) {
    logServerError("requestEngineDecision", error);
    redirect(`${back}?e=${engineErrorCode(error)}`);
  }
  revalidatePath(back);
  redirect(back);
}

export async function requestEngineVerification(formData: FormData) {
  const p = uuid.safeParse(formData.get("run_id"));
  if (!p.success) redirect("/runs?e=invalid");
  const back = `/runs/${p.data}`;
  const ctx = await getSessionContext();
  if (!ctx?.current) redirect("/dashboard");
  if (!["ADMIN", "ENGINEER"].includes(ctx.current.role)) redirect(`${back}?e=forbidden`);
  if (!engineConfigured()) redirect(`${back}?e=engineNotConnected`);
  const supabase = await createSupabaseServer();
  const { data: run } = await supabase.from("runs").select("status").eq("id", p.data).eq("organization_id", ctx.current.organizationId).maybeSingle();
  if (!run) redirect(`${back}?e=invalid`);
  if (run.status !== "COMPLETED") redirect(`${back}?e=notCompleted`);
  const answer = await verifyRun(p.data);
  if (!answer.ok) {
    logServerError("requestEngineVerification", null, { reason: "engine_answer", errorId: answer.error.errorId });
    redirect(`${back}?e=engineError`);
  }
  const key = engineWriteKey();
  if (!key) redirect(`${back}?e=engineKeyMissing`);
  const { error } = await supabase.rpc("record_engine_verification", {
    p_key: key, p_run: p.data, p_verification: toVerificationWrite(answer.result),
  });
  if (error) {
    logServerError("requestEngineVerification", error);
    redirect(`${back}?e=${engineErrorCode(error)}`);
  }
  revalidatePath(back);
  redirect(back);
}

// ---- FAIL loop, order A (0019): every write goes through a database function that
// checks role, order and references; the app only passes the user's choices.

const FAIL_ERRORS: [string, string][] = [
  ["fail_order", "failOrder"], ["fail_ref", "failRef"], ["fail_payload", "invalid"], ["fail_closed", "failClosed"],
  ["fail_not_failed", "failNotFailed"], ["knowledge_refused", "knowledgeRefused"],
  ["fail_verify", "failVerify"], ["fail_locked", "failLocked"],
  ["engine_run_not_completed", "notCompleted"],
];
const failErrorCode = (error: { code?: string; message?: string }) =>
  FAIL_ERRORS.find(([token]) => error.message?.startsWith(token))?.[1]
    ?? (error.code === "42501" ? "forbidden" : error.code === "23505" ? "duplicate" : "failed");

export async function recordProductVerification(formData: FormData) {
  const p = uuid.safeParse(formData.get("run_id"));
  if (!p.success) redirect("/runs?e=invalid");
  const back = `/runs/${p.data}`;
  const supabase = await createSupabaseServer();
  const { error } = await supabase.rpc("record_product_verification", { p_run: p.data });
  if (error) {
    logServerError("recordProductVerification", error);
    redirect(`${back}?e=${failErrorCode(error)}`);
  }
  revalidatePath(back);
  redirect(back);
}

export async function openFailCase(formData: FormData) {
  const p = z.object({ verification_id: uuid, run_id: uuid }).safeParse(fields(formData, ["verification_id", "run_id"]));
  if (!p.success) redirect("/fail-cases?e=invalid");
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.rpc("open_fail_case", { p_verification: p.data.verification_id });
  if (error || typeof data !== "string") {
    logServerError("openFailCase", error, error ? undefined : { reason: "no_id" });
    redirect(`/runs/${p.data.run_id}?e=${error ? failErrorCode(error) : "failed"}`);
  }
  revalidatePath("/fail-cases");
  redirect(`/fail-cases/${data}`);
}

const StepInput = z.object({
  case_id: uuid,
  step: z.enum(STEPS).exclude(["DECOMPOSITION"]),
  ref_id: optUuid,
  note: z.string().trim().max(2000).default(""),
});

export async function recordFailStep(formData: FormData) {
  const p = StepInput.safeParse(fields(formData, ["case_id", "step", "ref_id", "note"]));
  if (!p.success) {
    const id = uuid.safeParse(formData.get("case_id"));
    redirect(`${id.success ? `/fail-cases/${id.data}` : "/fail-cases"}?e=invalid`);
  }
  const back = `/fail-cases/${p.data.case_id}`;
  const payload: Record<string, unknown> = {};
  if (p.data.note) payload.note = p.data.note;
  if (p.data.step === "INTERVENTION") {
    const num = (v: FormDataEntryValue | null) => { const s = String(v ?? "").trim(); return s !== "" && Number.isFinite(Number(s)) ? Number(s) : s; };
    payload.changes = [0, 1, 2].map((i) => ({
      parameter: String(formData.get(`change_${i}_parameter`) ?? "").trim(),
      from: num(formData.get(`change_${i}_from`)), to: num(formData.get(`change_${i}_to`)),
      unit: String(formData.get(`change_${i}_unit`) ?? "").trim() || undefined,
    })).filter((c) => c.parameter !== "");
  }
  const supabase = await createSupabaseServer();
  const { error } = await supabase.rpc("record_fail_step", {
    p_case: p.data.case_id, p_step: p.data.step, p_ref: p.data.ref_id, p_payload: payload,
  });
  if (error) {
    logServerError(`recordFailStep:${p.data.step}`, error);
    redirect(`${back}?e=${failErrorCode(error)}`);
  }
  revalidatePath(back);
  redirect(back);
}

export async function closeFailCase(formData: FormData) {
  const p = z.object({ case_id: uuid, note: z.string().trim().min(1).max(2000) }).safeParse(fields(formData, ["case_id", "note"]));
  if (!p.success) {
    const id = uuid.safeParse(formData.get("case_id"));
    redirect(`${id.success ? `/fail-cases/${id.data}` : "/fail-cases"}?e=invalid`);
  }
  const back = `/fail-cases/${p.data.case_id}`;
  const supabase = await createSupabaseServer();
  const { error } = await supabase.rpc("close_fail_case", { p_case: p.data.case_id, p_note: p.data.note });
  if (error) {
    logServerError("closeFailCase", error);
    redirect(`${back}?e=${failErrorCode(error)}`);
  }
  revalidatePath(back);
  redirect(back);
}
