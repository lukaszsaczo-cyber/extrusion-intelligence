"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServer } from "@/lib/supabase/server";
import { LOCALE_COOKIE, isLocale } from "@/lib/i18n";

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
