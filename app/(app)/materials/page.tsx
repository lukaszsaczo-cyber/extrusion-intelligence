import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n";
import { getSessionContext } from "@/server/context";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createMaterial } from "@/server/actions";
import { DataTable, Empty, Field, FormGrid, Notice, PageHeader, Panel, formErrorKey } from "@/components/ui";

type MaterialRow = { id: string; name: string; supplier: string | null; material_lots: { count: number }[] };
type Spec = {
  id: string; code: string; product_name: string; source_org: string; parameter: string; unit: string; basis: string | null;
  kind: "MIN" | "MAX" | "TYPICAL_RANGE"; value_min: number | null; value_max: number | null; method: string | null;
  source_url: string; retrieved_on: string;
};

export default async function MaterialsPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { t } = await getT();
  const ctx = await getSessionContext();
  if (!ctx?.current) redirect("/dashboard");
  const canEdit = ctx.current.role === "ADMIN" || ctx.current.role === "ENGINEER";
  const errorKey = formErrorKey((await searchParams).e);

  const supabase = await createSupabaseServer();
  const [{ data }, specRes] = await Promise.all([
    supabase.from("materials").select("id, name, supplier, material_lots(count)")
      .eq("organization_id", ctx.current.organizationId).order("name"),
    supabase.from("reference_material_specs")
      .select("id, code, product_name, source_org, parameter, unit, basis, kind, value_min, value_max, method, source_url, retrieved_on")
      .order("code").order("source_org").order("parameter").order("kind"),
  ]);
  const materials = (data ?? []) as MaterialRow[];
  const specs = (specRes.data ?? []) as Spec[];
  // one entry per (code, source): the product sheet
  const sheets = [...new Map(specs.map((s) => [`${s.code}|${s.source_org}|${s.product_name}`, s])).values()];
  const owned = new Set(materials.map((m) => `${m.name}|${m.supplier ?? ""}`));
  const specValue = (s: Spec) => s.kind === "MIN" ? `≥ ${s.value_min}` : s.kind === "MAX" ? `≤ ${s.value_max}` : `${s.value_min}–${s.value_max}`;
  const na = t("common.notAvailable");

  return (
    <div className="space-y-6">
      <PageHeader title={t("materials.title")} />

      <Panel title={t("catalog.title")}>
        <Notice text={t("catalog.note")} />
        {sheets.length === 0 ? <Empty text={t("catalog.empty")} /> : sheets.map((sh) => {
          const rows = specs.filter((s) => s.code === sh.code && s.source_org === sh.source_org && s.product_name === sh.product_name);
          return (
            <div key={sh.id} className="border-t border-line">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm">
                <span className="num font-medium">{sh.code}</span>
                <span className="mr-auto text-muted">{sh.product_name} · {sh.source_org}</span>
                <a href={sh.source_url} target="_blank" rel="noopener noreferrer" className="text-teal hover:underline">{t("catalog.source")}</a>
                {canEdit && (owned.has(`${sh.code}|${sh.source_org}`) ? <span className="text-muted">{t("catalog.added")}</span> : (
                  <form action={createMaterial}>
                    <input type="hidden" name="name" value={sh.code} />
                    <input type="hidden" name="supplier" value={sh.source_org} />
                    <button className="rounded border border-line px-2 py-1 text-teal hover:border-teal">{t("catalog.addToMine")}</button>
                  </form>
                ))}
              </div>
              <DataTable head={[t("catalog.parameter"), t("catalog.kind"), t("catalog.value"), t("catalog.basis"), t("catalog.method")]}
                rows={rows.map((s) => [s.parameter, t(`catalog.kindValue.${s.kind}`), <span key="v" className="num">{specValue(s)} {s.unit}</span>,
                  s.basis ?? na, s.method ?? na])} />
              <p className="px-4 pb-3 text-xs text-muted">{t("catalog.retrieved")} <span className="num">{sh.retrieved_on}</span></p>
            </div>
          );
        })}
      </Panel>

      <Panel title={t("materials.list")}>
        {materials.length === 0 ? <Empty text={t("materials.empty")} /> : (
          <DataTable
            head={[t("materials.name"), t("materials.supplier"), t("materials.lots")]}
            rows={materials.map((m) => [
              m.name, m.supplier ?? na, <span key="n" className="num">{m.material_lots[0]?.count ?? 0}</span>,
            ])}
          />
        )}
      </Panel>

      <Panel title={t("materials.add")}>
        {errorKey && <Notice tone="stop" text={t(errorKey)} />}
        {!canEdit ? <Notice text={t("form.readOnly")} /> : (
          <FormGrid action={createMaterial} submit={t("form.add")}>
            <Field label={t("materials.name")} name="name" required />
            <Field label={t("materials.supplier")} name="supplier" />
          </FormGrid>
        )}
      </Panel>
    </div>
  );
}
