import "server-only";
import type { createSupabaseServer } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createSupabaseServer>>;

// Display names of users the caller may see (profiles RLS: self and members of
// a shared organization). Unknown ids fall back to a short id, never a guess.
export async function peopleNames(supabase: Client, ids: (string | null | undefined)[]): Promise<(id: string | null | undefined) => string | null> {
  const unique = [...new Set(ids.filter((x): x is string => typeof x === "string"))];
  const names = new Map<string, string>();
  if (unique.length) {
    const { data } = await supabase.from("profiles").select("id, display_name").in("id", unique);
    for (const p of (data ?? []) as { id: string; display_name: string | null }[]) {
      if (p.display_name?.trim()) names.set(p.id, p.display_name.trim());
    }
  }
  return (id) => (id ? names.get(id) ?? id.slice(0, 8) : null);
}
