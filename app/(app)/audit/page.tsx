import Link from "next/link";
import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n";
import { getSessionContext } from "@/server/context";
import { peopleNames } from "@/server/people";
import { createSupabaseServer } from "@/lib/supabase/server";
import { DataTable, Empty, Notice, PageHeader, Panel } from "@/components/ui";
import { integrityState, type IntegrityRow } from "./integrity";

type Rec = { id: string; run_id: string; final_hash: string; created_at: string; created_by: string | null };

export default async function AuditPage() {
  const { t, locale } = await getT();
  const ctx = await getSessionContext();
  if (!ctx?.current) redirect("/dashboard");
  const orgId = ctx.current.organizationId;
  const supabase = await createSupabaseServer();
  const [recRes, integRes] = await Promise.all([
    supabase.from("audit_records").select("id, run_id, final_hash, created_at, created_by")
      .eq("organization_id", orgId).order("created_at", { ascending: false }).limit(500),
    supabase.rpc("audit_integrity", { p_org: orgId }),
  ]);
  const records = (recRes.data ?? []) as Rec[];
  const integ = new Map(((integRes.data ?? []) as IntegrityRow[]).map((r) => [r.id, r]));
  const runIds = [...new Set(records.map((r) => r.run_id))];
  const runsRes = runIds.length ? await supabase.from("runs").select("id, run_code").in("id", runIds) : { data: [] };
  const runCode = new Map(((runsRes.data ?? []) as { id: string; run_code: string }[]).map((r) => [r.id, r.run_code]));
  const name = await peopleNames(supabase, records.map((r) => r.created_by));
  const fmt = new Intl.DateTimeFormat(locale === "pl" ? "pl-PL" : "en-GB", { dateStyle: "short", timeStyle: "short" });
  const states = records.map((r) => integrityState(integ.get(r.id)));
  const broken = states.filter((s) => s === "HASH_MISMATCH" || s === "CHAIN_BROKEN").length;
  const unchecked = integRes.error ? records.length : states.filter((s) => s === "NOT_AVAILABLE").length;

  return (
    <div className="space-y-6">
      <PageHeader title={t("audit.title")} />
      <Notice text={t("audit.hint")} />

      <Panel title={t("audit.integrity")}>
        <p className="px-4 py-4 text-sm">
          {records.length === 0 ? t("audit.noRecords")
            : unchecked > 0 ? <span className="text-caution">{t("audit.integrityNotChecked")}</span>
            : broken > 0 ? <span className="text-stop">{`${t("audit.integrityBroken")}: ${broken}`}</span>
            : <span className="text-teal">{`${t("audit.integrityOk")}: ${records.length}`}</span>}
        </p>
      </Panel>

      <Panel title={t("audit.records")}>
        {records.length === 0 ? <Empty text={t("audit.noRecordsHint")} /> : (
          <DataTable head={["#", t("runs.code"), t("audit.sealedAt"), t("audit.sealedBy"), t("audit.hash"), t("audit.state"), ""]}
            rows={records.map((r, i) => [
              <span key="s" className="num">{integ.get(r.id)?.seq ?? "—"}</span>,
              <Link key="r" href={`/runs/${r.run_id}`} className="underline decoration-line underline-offset-4">{runCode.get(r.run_id) ?? r.run_id.slice(0, 8)}</Link>,
              <span key="t" className="num">{fmt.format(new Date(r.created_at))}</span>,
              <span key="u" className="num">{name(r.created_by) ?? t("common.notAvailable")}</span>,
              <span key="h" className="num">{r.final_hash.slice(0, 12)}…</span>,
              <span key="st" className={states[i] === "INTACT" ? "text-teal" : states[i] === "NOT_AVAILABLE" ? "text-caution" : "text-stop"}>{t(`audit.stateLabel.${states[i]}`)}</span>,
              <span key="a" className="flex gap-3">
                <Link href={`/audit/${r.id}`} className="underline decoration-line underline-offset-4">{t("audit.open")}</Link>
                <a href={`/api/audit/${r.id}/export`} className="underline decoration-line underline-offset-4">JSON</a>
              </span>,
            ])} />
        )}
      </Panel>
    </div>
  );
}
