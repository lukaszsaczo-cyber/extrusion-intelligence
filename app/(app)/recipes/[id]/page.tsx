import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getT } from "@/lib/i18n";
import { getSessionContext } from "@/server/context";
import { createSupabaseServer } from "@/lib/supabase/server";
import { addRecipeComponent, createRecipeVersion, finalizeRecipeVersion } from "@/server/actions";
import { DataTable, Empty, Field, FormGrid, Notice, PageHeader, Panel, Select } from "@/components/ui";

type Version = { id: string; version: number; status: string };
type Component = { id: string; recipe_version_id: string; material_id: string; percent_wet: number };
type Material = { id: string; name: string };

const ERRORS = ["invalid", "forbidden", "failed", "duplicate", "sum"];

export default async function RecipeDetail({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ e?: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { e } = await searchParams;
  const { t } = await getT();
  const ctx = await getSessionContext();
  if (!ctx?.current) redirect("/dashboard");
  const orgId = ctx.current.organizationId;
  const supabase = await createSupabaseServer();
  const { data: recipe } = await supabase.from("recipes").select("id, name, product_type")
    .eq("id", id).eq("organization_id", orgId).maybeSingle();
  if (!recipe) notFound();

  const [versionsRes, materialsRes] = await Promise.all([
    supabase.from("recipe_versions").select("id, version, status").eq("recipe_id", id).order("version", { ascending: false }),
    supabase.from("materials").select("id, name").eq("organization_id", orgId).order("name"),
  ]);
  const versions = (versionsRes.data ?? []) as Version[];
  const materials = (materialsRes.data ?? []) as Material[];
  const componentsRes = versions.length
    ? await supabase.from("recipe_components").select("id, recipe_version_id, material_id, percent_wet").in("recipe_version_id", versions.map((v) => v.id))
    : { data: [] as Component[] };
  const components = (componentsRes.data ?? []) as Component[];
  const materialName = new Map(materials.map((m) => [m.id, m.name]));
  const canEdit = ctx.current.role === "ADMIN" || ctx.current.role === "ENGINEER";
  const na = t("common.notAvailable");

  return (
    <div className="space-y-6">
      <PageHeader title={`${t("recipes.title")}: ${recipe.name}`}>
        <Link href="/recipes" className="rounded border border-line px-3 py-2 text-sm">{t("recipes.back")}</Link>
      </PageHeader>
      {e && ERRORS.includes(e) && <p className="text-sm text-stop">{t(e === "sum" ? "recipes.errSum" : `errors.${e}`)}</p>}
      <p className="text-sm text-muted">{t("recipes.finalHint")}</p>

      {canEdit && (
        <form action={createRecipeVersion}>
          <input type="hidden" name="recipe_id" value={id} />
          <button className="rounded bg-teal px-3 py-2 text-sm font-medium text-ground">{t("recipes.newVersion")}</button>
        </form>
      )}

      {versions.length === 0 ? <Empty text={t("recipes.noVersions")} /> : versions.map((v) => {
        const rows = components.filter((c) => c.recipe_version_id === v.id);
        const sum = rows.reduce((s, c) => s + Number(c.percent_wet), 0);
        const draft = v.status === "DRAFT";
        return (
          <Panel key={v.id} title={`${t("recipes.version")} ${v.version} · ${t(`recipes.status.${v.status}`)}`}>
            {rows.length === 0 ? <Empty text={t("recipes.noComponents")} /> : (
              <DataTable head={[t("recipes.material"), t("recipes.percentWet")]}
                rows={rows.map((c) => [materialName.get(c.material_id) ?? na, <span key="p" className="num">{Number(c.percent_wet)}</span>])} />
            )}
            <p className="px-4 py-2 text-sm">
              {t("recipes.sum")}: <span className={`num ${Math.abs(sum - 100) < 1e-9 ? "text-teal" : "text-caution"}`}>{Math.round(sum * 1000) / 1000} %</span>
            </p>
            {draft && canEdit && (
              materials.length === 0 ? <Notice text={t("recipes.noMaterials")} /> : (
                <FormGrid action={addRecipeComponent} submit={t("form.add")}>
                  <input type="hidden" name="recipe_id" value={id} />
                  <input type="hidden" name="recipe_version_id" value={v.id} />
                  <Select label={t("recipes.material")} name="material_id" required options={materials.map((m) => ({ value: m.id, label: m.name }))} />
                  <Field label={t("recipes.percentWet")} name="percent_wet" type="number" step="any" min={0} max={100} required />
                </FormGrid>
              )
            )}
            {draft && canEdit && (
              <form action={finalizeRecipeVersion} className="px-4 pb-4">
                <input type="hidden" name="recipe_id" value={id} />
                <input type="hidden" name="recipe_version_id" value={v.id} />
                <button className="rounded border border-line px-3 py-2 text-sm">{t("recipes.finalize")}</button>
              </form>
            )}
          </Panel>
        );
      })}
    </div>
  );
}
