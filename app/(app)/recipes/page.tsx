import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n";
import { getSessionContext } from "@/server/context";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createRecipe } from "@/server/actions";
import { DataTable, Empty, Field, FormGrid, Notice, PageHeader, Panel, formErrorKey } from "@/components/ui";

type RecipeRow = {
  id: string; name: string; product_type: string | null; created_at: string; recipe_versions: { count: number }[];
};

export default async function RecipesPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { t, locale } = await getT();
  const ctx = await getSessionContext();
  if (!ctx?.current) redirect("/dashboard");
  const canEdit = ctx.current.role === "ADMIN" || ctx.current.role === "ENGINEER";
  const errorKey = formErrorKey((await searchParams).e);

  const supabase = await createSupabaseServer();
  const { data } = await supabase.from("recipes")
    .select("id, name, product_type, created_at, recipe_versions(count)")
    .eq("organization_id", ctx.current.organizationId).order("created_at", { ascending: false });
  const recipes = (data ?? []) as RecipeRow[];
  const na = t("common.notAvailable");
  const fmt = new Intl.DateTimeFormat(locale === "pl" ? "pl-PL" : "en-GB", { dateStyle: "short" });

  return (
    <div className="space-y-6">
      <PageHeader title={t("recipes.title")} />

      <Panel title={t("recipes.list")}>
        {recipes.length === 0 ? <Empty text={t("recipes.empty")} /> : (
          <DataTable
            head={[t("recipes.name"), t("recipes.productType"), t("recipes.versions"), t("recipes.created")]}
            rows={recipes.map((r) => [
              r.name, r.product_type ?? na,
              <span key="v" className="num">{r.recipe_versions[0]?.count ?? 0}</span>,
              <span key="c" className="num">{fmt.format(new Date(r.created_at))}</span>,
            ])}
          />
        )}
      </Panel>

      <Panel title={t("recipes.add")}>
        {errorKey && <Notice tone="stop" text={t(errorKey)} />}
        {!canEdit ? <Notice text={t("form.readOnly")} /> : (
          <FormGrid action={createRecipe} submit={t("form.add")}>
            <Field label={t("recipes.name")} name="name" required />
            <Field label={t("recipes.productType")} name="product_type" />
          </FormGrid>
        )}
      </Panel>
    </div>
  );
}
