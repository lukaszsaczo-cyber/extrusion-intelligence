"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServer } from "@/lib/supabase/server";
import { LOCALE_COOKIE, isLocale } from "@/lib/i18n";
import { getSessionContext } from "@/server/context";

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
  if (error) redirect("/dashboard?e=failed");
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

// Inserts one row into the caller's current organization and returns to `path`
// with ?e=invalid|forbidden|failed on error. Organization id never comes from the form.
async function insertForOrg(path: string, table: string, row: Record<string, unknown> | null) {
  if (!row) redirect(`${path}?e=invalid`);
  const ctx = await getSessionContext();
  if (!ctx?.current) redirect("/dashboard");
  const supabase = await createSupabaseServer();
  const { error } = await supabase.from(table).insert({ ...row, organization_id: ctx.current.organizationId });
  if (error) redirect(`${path}?e=${error.code === "42501" ? "forbidden" : error.code === "23505" ? "duplicate" : "failed"}`);
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

const RunInput = z.object({ machine_id: uuid, run_code: text(64) });

export async function createRun(formData: FormData) {
  const p = RunInput.safeParse(fields(formData, ["machine_id", "run_code"]));
  // New runs start as PLANNED (column default); status changes come with run import later.
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
  if (error) redirect("/settings?e=failed");
  if (!data?.length) redirect("/settings?e=forbidden");
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
  if (error) redirect(`${back}?e=${error.message.includes("sum to 100") ? "sum" : error.code === "42501" ? "forbidden" : "failed"}`);
  if (!data?.length) redirect(`${back}?e=forbidden`);
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
  if (error || !data) redirect(`/preflight?e=${error?.code === "42501" ? "forbidden" : "failed"}`);
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
    const m = error.message;
    redirect(`${back}?e=${m.includes("forbidden") ? "forbidden" : m.includes("not available") ? "notApprovable" : m.includes("already") ? "already" : "failed"}`);
  }
  revalidatePath(back);
  redirect(back);
}
