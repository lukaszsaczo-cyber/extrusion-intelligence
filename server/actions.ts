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
  if (error) redirect(`${path}?e=${error.code === "42501" ? "forbidden" : "failed"}`);
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
