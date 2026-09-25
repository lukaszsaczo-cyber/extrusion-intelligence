import Link from "next/link";
import { getT } from "@/lib/i18n";
import { getSessionContext } from "@/server/context";
import { getEngineHealth } from "@/server/engine";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createOrganization } from "@/server/actions";

type RunRow = { id: string; run_code: string; status: string; started_at: string | null; machine_id: string };
type MachineRow = { id: string; manufacturer: string | null; model: string | null; serial_number: string | null };
type DecisionRow = { id: string; version: number; preflight_status: string; preflight_at: string | null; machine_id: string };
type VerificationRow = { id: string; kind: string; state: string; verified_at: string; run_id: string };

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
  const na = t("common.notAvailable");
  const supabase = await createSupabaseServer();
  const [machinesRes, runsCountRes, activeRes, runsRes, decisionsRes, verificationsRes, auditCountRes, auditLastRes, engine] = await Promise.all([
    supabase.from("machines").select("id, manufacturer, model, serial_number").eq("organization_id", orgId),
    supabase.from("runs").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
    supabase.from("runs").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "RUNNING"),
    supabase.from("runs").select("id, run_code, status, started_at, machine_id")
      .eq("organization_id", orgId).order("created_at", { ascending: false }).limit(10),
    supabase.from("process_plans").select("id, version, preflight_status, preflight_at, machine_id")
      .eq("organization_id", orgId).not("preflight_status", "is", null).order("preflight_at", { ascending: false }).limit(5),
    supabase.from("verifications").select("id, kind, state, verified_at, run_id")
      .eq("organization_id", orgId).order("verified_at", { ascending: false }).limit(5),
    supabase.from("audit_records").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
    supabase.from("audit_records").select("created_at").eq("organization_id", orgId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    getEngineHealth(),
  ]);
  const decisions = (decisionsRes.data ?? []) as DecisionRow[];
  const verifications = (verificationsRes.data ?? []) as VerificationRow[];
  const count = (r: { error: unknown; count: number | null }) => (r.error || r.count == null ? na : String(r.count));
  const machines = (machinesRes.data ?? []) as MachineRow[];
  const runs = (runsRes.data ?? []) as RunRow[];
  const machineName = new Map(machines.map((m) => [m.id,
    [m.manufacturer, m.model, m.serial_number].filter(Boolean).join(" ") || m.id.slice(0, 8)]));
  const fmt = new Intl.DateTimeFormat(locale === "pl" ? "pl-PL" : "en-GB", { dateStyle: "short", timeStyle: "short" });

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

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {stat(t("dashboard.machines"), machinesRes.error ? na : String(machines.length))}
        {stat(t("dashboard.runs"), count(runsCountRes))}
        {stat(t("dashboard.activeRuns"), count(activeRes))}
        {stat(t("dashboard.audit"), count(auditCountRes))}
        <div className="rounded-md border border-line bg-panel p-4">
          <div className="text-sm text-muted">{t("dashboard.engine")}</div>
          <div className={`mt-1 text-sm ${engine.connected ? "text-teal" : "text-unknown"}`}>
            {engine.connected ? t("engine.connected") : t("engine.notConnected")}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-md border border-line bg-panel">
          <h2 className="border-b border-line px-4 py-3 text-sm font-medium">{t("dashboard.recentDecisions")}</h2>
          {decisions.length === 0 ? <p className="px-4 py-6 text-sm text-muted">{t("dashboard.noDecisions")}</p> : (
            <ul className="divide-y divide-line text-sm">
              {decisions.map((d) => (
                <li key={d.id} className="flex flex-wrap gap-x-4 px-4 py-2">
                  <span>{machineName.get(d.machine_id) ?? na}</span>
                  <span className="num text-muted">v{d.version}</span>
                  <span>{t(`dashboard.decision.${d.preflight_status}`)}</span>
                  <span className="num ml-auto text-muted">{d.preflight_at ? fmt.format(new Date(d.preflight_at)) : na}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-md border border-line bg-panel">
          <h2 className="border-b border-line px-4 py-3 text-sm font-medium">{t("dashboard.recentVerifications")}</h2>
          {verifications.length === 0 ? <p className="px-4 py-6 text-sm text-muted">{t("dashboard.noVerifications")}</p> : (
            <ul className="divide-y divide-line text-sm">
              {verifications.map((v) => (
                <li key={v.id} className="flex flex-wrap gap-x-4 px-4 py-2">
                  <span>{t(`dashboard.verificationKind.${v.kind}`)}</span>
                  <span className={v.state === "VERIFIED_PASS" ? "text-teal" : v.state === "VERIFIED_FAIL" ? "text-stop" : "text-caution"}>
                    {t(`dashboard.verificationState.${v.state}`)}</span>
                  <span className="num ml-auto text-muted">{fmt.format(new Date(v.verified_at))}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-md border border-line bg-panel">
          <h2 className="border-b border-line px-4 py-3 text-sm font-medium">{t("dashboard.alerts")}</h2>
          <p className="px-4 pt-4 text-sm font-medium text-unknown">{na}</p>
          <p className="px-4 pb-4 pt-1 text-sm text-muted">{t("dashboard.alertsNote")}</p>
        </section>
        <section className="rounded-md border border-line bg-panel">
          <h2 className="border-b border-line px-4 py-3 text-sm font-medium">{t("dashboard.auditTitle")}</h2>
          <p className="px-4 py-4 text-sm">
            <span className="text-muted">{t("dashboard.auditLast")}: </span>
            <span className="num">{auditLastRes.data?.created_at ? fmt.format(new Date(auditLastRes.data.created_at)) : na}</span>
          </p>
        </section>
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
