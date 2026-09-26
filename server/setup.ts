import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SetupCounts } from "@/lib/wizard/steps";

// Counts for the setup steps (head requests only, no rows transferred).
export async function setupCounts(supabase: SupabaseClient, orgId: string): Promise<SetupCounts> {
  const count = (table: string, final = false) => {
    let q = supabase.from(table).select("id", { count: "exact", head: true }).eq("organization_id", orgId);
    if (final) q = q.eq("status", "FINAL");
    return q.then((r) => r.count ?? 0);
  };
  const [products, sites, machines, materials, finalRecipes] = await Promise.all([
    count("product_targets"), count("sites"), count("machines"), count("materials"), count("recipe_versions", true),
  ]);
  return { products, sites, machines, materials, finalRecipes };
}
