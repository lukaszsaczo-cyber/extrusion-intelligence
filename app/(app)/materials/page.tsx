import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n";
import { getSessionContext } from "@/server/context";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createMaterial } from "@/server/actions";
import { DataTable, Empty, Field, FormGrid, Notice, PageHeader, Panel, formErrorKey } from "@/components/ui";

type MaterialRow = { id: string; name: string; supplier: string | null; material_lots: { count: number }[] };

export default async function MaterialsPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { t } = await getT();
  const ctx = await getSessionContext();
  if (!ctx?.current) redirect("/dashboard");
  const canEdit = ctx.current.role === "ADMIN" || ctx.current.role === "ENGINEER";
  const errorKey = formErrorKey((await searchParams).e);

  const supabase = await createSupabaseServer();
  const { data } = await supabase.from("materials")
    .select("id, name, supplier, material_lots(count)")
    .eq("organization_id", ctx.current.organizationId).order("name");
  const materials = (data ?? []) as MaterialRow[];
  const na = t("common.notAvailable");

  return (
    <div className="space-y-6">
      <PageHeader title={t("materials.title")} />

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
