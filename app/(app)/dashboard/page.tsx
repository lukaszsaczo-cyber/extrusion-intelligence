import Link from "next/link";
import { getT } from "@/lib/i18n";
import { getSessionContext } from "@/server/context";
import { getEngineHealth } from "@/server/engine";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createOrganization } from "@/server/actions";

type RunRow = { id: string; run_code: string; status: string; started_at: string | null; machine_id: string };
type MachineRow = { id: string; manufacturer: string | null; model: string | null; serial_number: string | null };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { t, locale } = await getT();
  const ctx = await getSessionContext();
  const { e } = await searchParams;

  if (!ctx?.current) {
    return (
      <section className="max-w-lg rounded-md border border-line bg-panel p-6">
        <h1 className="text-xl font-semibold">{t("onboarding.title")}</h1>
        <p className="mt-2 text-sm text-muted">{t("onboarding.body")}</p>
        <form action={createOrganization} className="mt-5 space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-muted">{t("onboarding.name")}</span>
            <input name="name" required maxLength={200}
              className="w-full rounded border border-line bg-ground px-3 py-2 outline-none focus:border-teal" />
          </label>
          {e && <p className="text-sm text-stop">{e === "invalid" ? t("onboarding.invalid") : t("errors.generic")}</p>}
          <button className="rounded bg-teal px-3 py-2 text-sm font-medium text-ground">{t("onboarding.create")}</button>
        </form>
      </section>
    );
  }

  const orgId = ctx.current.organizationId;
  const supabase = await createSupabaseServer();
  const [machinesRes, runsCountRes, runsRes, engine] = await Promise.all([
    supabase.from("machines").select("id, manufacturer, model, serial_number").eq("organization_id", orgId),
    supabase.from("runs").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
    supabase.from("runs").select("id, run_code, status, started_at, machine_id")
      .eq("organization_id", orgId).order("created_at", { ascending: false }).limit(10),
    getEngineHealth(),
  ]);
  const machines = (machinesRes.data ?? []) as MachineRow[];
  const runs = (runsRes.data ?? []) as RunRow[];
  const machineName = new Map(machines.map((m) => [m.id,
    [m.manufacturer, m.model, m.serial_number].filter(Boolean).join(" ") || m.id.slice(0, 8)]));
  const fmt = new Intl.DateTimeFormat(locale === "pl" ? "pl-PL" : "en-GB", { dateStyle: "short", timeStyle: "short" });
  const na = t("common.notAvailable");

  const stat = (label: string, value: string, tone = "text-ink") => (
    <div className="rounded-md border border-line bg-panel p-4">
      <div className="text-sm text-muted">{label}</div>
      <div className={`num mt-1 text-2xl ${tone}`}>{value}</div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-xl font-semibold">{t("dashboard.title")}</h1>
        <Link href="/new-product" className="rounded bg-teal px-3 py-2 text-sm font-medium text-ground">{t("dashboard.actions.newProduct")}</Link>
        <Link href="/preflight" className="rounded border border-line px-3 py-2 text-sm">{t("dashboard.actions.analyze")}</Link>
        <Link href="/runs" className="rounded border border-line px-3 py-2 text-sm">{t("dashboard.actions.import")}</Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {stat(t("dashboard.machines"), machinesRes.error ? na : String(machines.length))}
        {stat(t("dashboard.runs"), runsCountRes.error || runsCountRes.count == null ? na : String(runsCountRes.count))}
        <div className="rounded-md border border-line bg-panel p-4">
          <div className="text-sm text-muted">{t("dashboard.engine")}</div>
          <div className={`mt-1 text-sm ${engine.connected ? "text-teal" : "text-unknown"}`}>
            {engine.connected ? t("engine.connected") : t("engine.notConnected")}
          </div>
        </div>
      </div>

      <section className="rounded-md border border-line bg-panel">
        <h2 className="border-b border-line px-4 py-3 text-sm font-medium">{t("dashboard.recentRuns")}</h2>
        {runs.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">{t("dashboard.noRuns")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr>
                  <th className="px-4 py-2 font-normal">{t("dashboard.col.run")}</th>
                  <th className="px-4 py-2 font-normal">{t("dashboard.col.machine")}</th>
                  <th className="px-4 py-2 font-normal">{t("dashboard.col.status")}</th>
                  <th className="px-4 py-2 font-normal">{t("dashboard.col.start")}</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-t border-line">
                    <td className="num px-4 py-2">{r.run_code}</td>
                    <td className="px-4 py-2">{machineName.get(r.machine_id) ?? na}</td>
                    <td className="px-4 py-2">{t(`runStatus.${r.status}`)}</td>
                    <td className="num px-4 py-2">{r.started_at ? fmt.format(new Date(r.started_at)) : na}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
