import Link from "next/link";
import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n";
import { getSessionContext } from "@/server/context";
import { createSupabaseServer } from "@/lib/supabase/server";
import { addTargetValue, createProductTarget } from "@/server/actions";
import { DataTable, Empty, Field, FormGrid, Notice, PageHeader, Panel, Select, formErrorKey } from "@/components/ui";
import { SetupSteps } from "@/components/setup-steps";
import { setupSteps } from "@/lib/wizard/steps";
import { setupCounts } from "@/server/setup";
import { PROTEIN_CATALOG } from "@/lib/materials/protein-catalog";

type Target = { id: string; name: string; product_type: string | null; shape: string | null; main_ingredients: string[] | null };
type Value = {
  id: string; product_target_id: string; parameter: string; unit: string | null;
  min_value: number | null; target_value: number | null; max_value: number | null; priority: string | null;
};

// Wizard step 1 (product): what the product must achieve. Next step is the plan.
export default async function NewProduct({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { t, locale } = await getT();
  const ctx = await getSessionContext();
  if (!ctx?.current) redirect("/dashboard");
  const orgId = ctx.current.organizationId;
  const errorKey = formErrorKey((await searchParams).e);
  const supabase = await createSupabaseServer();
  const [targetsRes, valuesRes, counts] = await Promise.all([
    supabase.from("product_targets").select("id, name, product_type, shape, main_ingredients").eq("organization_id", orgId).order("created_at", { ascending: false }),
    supabase.from("product_target_values").select("id, product_target_id, parameter, unit, min_value, target_value, max_value, priority").eq("organization_id", orgId),
    setupCounts(supabase, orgId),
  ]);
  const targets = (targetsRes.data ?? []) as Target[];
  const values = (valuesRes.data ?? []) as Value[];
  const canEdit = ctx.current.role === "ADMIN" || ctx.current.role === "ENGINEER";
  const na = t("common.notAvailable");
  const n = (v: number | null) => <span className="num">{v ?? "—"}</span>;

  return (
    <div className="space-y-6">
      <PageHeader title={t("product.title")}>
        <Link href="/preflight" className="rounded bg-teal px-3 py-2 text-sm font-medium text-ground">{t("product.toPlan")}</Link>
      </PageHeader>
      <p className="text-sm text-muted">{t("product.intro")}</p>
      {errorKey && <p className="text-sm text-stop">{t(errorKey)}</p>}
      <SetupSteps steps={setupSteps(counts)} title={t("setup.title")} doneLabel={t("setup.done")} todoLabel={t("setup.todo")}
        labels={{ product: t("setup.product"), site: t("setup.site"), machine: t("setup.machine"), material: t("setup.material"), recipe: t("setup.recipe") }} />

      {targets.length === 0 ? <Panel title={t("product.targets")}><Empty text={t("product.noTargets")} /></Panel>
        : targets.map((tg) => {
          const rows = values.filter((v) => v.product_target_id === tg.id);
          return (
            <Panel key={tg.id} title={`${tg.name}${tg.product_type ? ` · ${tg.product_type}` : ""}${tg.shape ? ` · ${tg.shape}` : ""}`}>
              {(tg.main_ingredients?.length ?? 0) > 0 && (
                <p className="border-b border-line px-4 py-2 text-sm"><span className="text-muted">{t("product.mainIngredients")}: </span>{tg.main_ingredients!.join(", ")}</p>
              )}
              {rows.length === 0 ? <Empty text={t("product.noValues")} /> : (
                <DataTable head={[t("product.parameter"), "min", t("product.target"), "max", t("product.unit"), t("product.priority")]}
                  rows={rows.map((v) => [v.parameter, n(v.min_value), n(v.target_value), n(v.max_value), v.unit ?? na,
                    v.priority ? t(`product.priorityValue.${v.priority}`) : na])} />
              )}
            </Panel>
          );
        })}

      <Panel title={t("product.addTarget")}>
        {!canEdit ? <Notice text={t("form.readOnly")} /> : (
          <FormGrid action={createProductTarget} submit={t("form.add")}>
            <Field label={t("product.name")} name="name" required />
            <Field label={t("product.type")} name="product_type" />
            <Field label={t("product.shape")} name="shape" />
            <fieldset className="sm:col-span-2 lg:col-span-3">
              <legend className="mb-1 text-sm text-muted">{t("product.mainIngredients")}</legend>
              <div className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
                {PROTEIN_CATALOG.map((c) => (
                  <label key={c.code} className="flex items-center gap-2">
                    <input type="checkbox" name="main_ingredient" value={c.code} />
                    <span><span className="num">{c.code}</span> <span className="text-muted">· {locale === "pl" ? c.pl : c.en}</span></span>
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted">{t("product.ingredientsNote")}</p>
            </fieldset>
            <Field label={t("product.otherIngredients")} name="other_ingredients" maxLength={400} />
          </FormGrid>
        )}
      </Panel>

      {canEdit && targets.length > 0 && (
        <Panel title={t("product.addValue")}>
          <Notice text={t("product.valueHint")} />
          <FormGrid action={addTargetValue} submit={t("form.add")}>
            <Select label={t("product.targets")} name="product_target_id" required options={targets.map((tg) => ({ value: tg.id, label: tg.name }))} />
            <Field label={t("product.parameter")} name="parameter" required maxLength={64} />
            <Field label={t("product.unit")} name="unit" maxLength={32} />
            <Field label="min" name="min_value" type="number" step="any" />
            <Field label={t("product.target")} name="target_value" type="number" step="any" />
            <Field label="max" name="max_value" type="number" step="any" />
            <Select label={t("product.priority")} name="priority" empty={t("common.none")}
              options={["LOW", "MEDIUM", "HIGH"].map((p) => ({ value: p, label: t(`product.priorityValue.${p}`) }))} />
          </FormGrid>
        </Panel>
      )}
    </div>
  );
}
