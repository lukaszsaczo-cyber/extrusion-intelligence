import Link from "next/link";
import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n";
import { getSessionContext } from "@/server/context";
import { createSupabaseServer } from "@/lib/supabase/server";
import { DataTable, Empty, Notice, PageHeader, Panel } from "@/components/ui";

type MachineRow = { id: string; manufacturer: string | null; model: string | null; serial_number: string | null };

export default async function MachineConsoleIndex() {
  const { t } = await getT();
  const ctx = await getSessionContext();
  if (!ctx?.current) redirect("/dashboard");
  const supabase = await createSupabaseServer();
  const { data } = await supabase.from("machines").select("id, manufacturer, model, serial_number")
    .eq("organization_id", ctx.current.organizationId).order("created_at");
  const machines = (data ?? []) as MachineRow[];
  const na = t("common.notAvailable");
  return (
    <div className="space-y-6">
      <PageHeader title={t("console.title")} />
      <Notice text={t("console.noLiveV1")} />
      <Panel title={t("console.pick")}>
        {machines.length === 0 ? <Empty text={t("machines.empty")} /> : (
          <DataTable head={[t("machines.manufacturer"), t("machines.model"), t("machines.serial"), ""]}
            rows={machines.map((m) => [m.manufacturer ?? na, m.model ?? na, m.serial_number ?? na,
              <Link key="o" href={`/machine-console/${m.id}`} className="text-teal hover:underline">{t("console.open")}</Link>])} />
        )}
      </Panel>
    </div>
  );
}
