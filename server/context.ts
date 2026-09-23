import "server-only";
import { createSupabaseServer } from "@/lib/supabase/server";

export type Role = "ADMIN" | "ENGINEER" | "OPERATOR" | "VIEWER";
export type Membership = { organizationId: string; organizationName: string; role: Role };
export type SessionContext = { userId: string; email: string | null; memberships: Membership[]; current: Membership | null };

const ROLES: readonly Role[] = ["ADMIN", "ENGINEER", "OPERATOR", "VIEWER"];

// Organization and role come from the session + RLS-filtered membership rows,
// never from anything the browser sends.
export async function getSessionContext(): Promise<SessionContext | null> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: rows } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id);
  const ids = (rows ?? []).map((r: { organization_id: string }) => r.organization_id);
  const { data: orgs } = ids.length
    ? await supabase.from("organizations").select("id, name").in("id", ids)
    : { data: [] as { id: string; name: string }[] };
  const names = new Map((orgs ?? []).map((o: { id: string; name: string }) => [o.id, o.name]));
  const memberships: Membership[] = (rows ?? [])
    .filter((r: { role: string }) => (ROLES as readonly string[]).includes(r.role))
    .map((r: { organization_id: string; role: string }) => ({
      organizationId: r.organization_id,
      organizationName: names.get(r.organization_id) ?? "",
      role: r.role as Role,
    }));
  return { userId: user.id, email: user.email ?? null, memberships, current: memberships[0] ?? null };
}
