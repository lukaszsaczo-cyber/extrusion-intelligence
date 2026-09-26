import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getT } from "@/lib/i18n";
import { getSessionContext } from "@/server/context";
import { peopleNames } from "@/server/people";
import { createSupabaseServer } from "@/lib/supabase/server";
import { AUDIT_SNAPSHOT_ALLOWLIST, applyAllowlist } from "@/lib/audit/export";
import { toContractAuditArgs } from "@/lib/audit/contract-record";
import { contractAuditExport } from "@/server/engine";
import { DataTable, Empty, Notice, PageHeader, Panel } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { integrityState, type IntegrityRow } from "../integrity";

type Stamp = { created_at: string; created_by: string | null };
type Snap = {
  schema: string; organization?: { name: string } | null; site?: { name: string } | null;
  machine?: { manufacturer: string | null; model: string | null; serial_number: string | null } | null;
  recipe_version?: { recipe: string; version: number; status: string } | null;
  seq: number; previous_hash: string | null; sealed_at: string; sealed_by: string | null;
  run: { run_code: string; status: string; started_at: string | null; ended_at: string | null; operator_id: string | null } & Stamp | null;
  plan: null | ({
    version: number; screw_rpm: number | null; feed_kg_h: number | null; water_kg_h: number | null; steam_kg_h: number | null;
    cutter_rpm: number | null; zone_setpoints_c: number[] | null;
    decision: { status: string | null; confidence_label: string | null; risk_categories: string[] | null; missing_inputs: string[] | null; decided_at: string | null };
    approval: { approved_by: string | null; approved_at: string | null };
  } & Stamp);
  files: ({ filename: string; sha256: string; row_count: number | null } & Stamp)[];
  quality: ({ ruleset_version: string; verdict: string } & Stamp)[];
  state_snapshots: ({ sha256: string; schema_version: string } & Stamp)[];
  diagnoses: ({ status: string; gates_version: string } & Stamp)[];
  predictions: { metric: string; kind: string; value: number | null; min_value: number | null; max_value: number | null; unit: string; created_at: string }[];
  measurements: ({ sample_code: string; parameter: string; value: number; unit: string | null } & Stamp)[];
  verifications: ({ kind: string; state: string; evidence_saved: boolean; verified_at: string } & Stamp)[];
};

export default async function AuditRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { t, locale } = await getT();
  const ctx = await getSessionContext();
  if (!ctx?.current) redirect("/dashboard");
  const orgId = ctx.current.organizationId;
  const supabase = await createSupabaseServer();
  const { data } = await supabase.from("audit_records").select("id, run_id, final_hash, created_at, snapshot")
    .eq("id", id).eq("organization_id", orgId).maybeSingle();
  if (!data) notFound();
  const { data: integ } = await supabase.rpc("audit_integrity", { p_org: orgId }).eq("id", id);
  const state = integrityState(((integ ?? []) as IntegrityRow[])[0]);
  // Show exactly what the export would contain: the allowlisted snapshot.
  const s = applyAllowlist(data.snapshot, AUDIT_SNAPSHOT_ALLOWLIST).value as Snap;
  const contract = contractAuditExport(toContractAuditArgs(data.id, s));

  const users = [s.sealed_by, s.run?.created_by, s.run?.operator_id, s.plan?.created_by, s.plan?.approval.approved_by,
    ...s.files.map((x) => x.created_by), ...s.measurements.map((x) => x.created_by),
    ...s.quality.map((x) => x.created_by), ...s.diagnoses.map((x) => x.created_by)];
  const name = await peopleNames(supabase, users);
  const na = t("common.notAvailable");
  const fmt = new Intl.DateTimeFormat(locale === "pl" ? "pl-PL" : "en-GB", { dateStyle: "short", timeStyle: "medium" });
  const when = (x: string | null | undefined) => <span className="num">{x ? fmt.format(new Date(x)) : na}</span>;
  const who = (x: string | null | undefined) => <span className="num">{name(x) ?? na}</span>;
  const n = (x: number | null | undefined) => <span className="num">{x ?? "—"}</span>;
  const tone = state === "INTACT" ? "text-teal" : state === "NOT_AVAILABLE" ? "text-caution" : "text-stop";

  return (
    <div className="space-y-6">
      <PageHeader title={`${t("audit.record")} #${s.seq}: ${s.run?.run_code ?? na}`}>
        <PrintButton label={t("audit.print")} />
        <a href={`/api/audit/${id}/export`} className="rounded border border-line px-3 py-2 text-sm print:hidden">{t("audit.exportJson")}</a>
        <Link href="/audit" className="rounded border border-line px-3 py-2 text-sm print:hidden">{t("import.back")}</Link>
      </PageHeader>

      <Panel title={t("audit.integrity")}>
        <DataTable head={[t("preflight.field"), t("preflight.valueCol")]} rows={[
          [t("audit.state"), <span key="s" className={tone}>{t(`audit.stateLabel.${state}`)}</span>],
          [t("audit.seq"), n(s.seq)],
          [t("audit.hash"), <span key="h" className="num break-all">{data.final_hash}</span>],
          [t("audit.previousHash"), <span key="p" className="num break-all">{s.previous_hash ?? t("audit.first")}</span>],
          [t("audit.sealedAt"), when(s.sealed_at)],
          [t("audit.sealedBy"), who(s.sealed_by)],
          [t("audit.schema"), <span key="v" className="num">{s.schema}</span>],
          [t("audit.contractHash"), <span key="c" className="num break-all">{String(contract.finalAuditHash)}</span>],
        ]} />
        <Notice text={t("audit.integrityHint")} />
      </Panel>

      <Panel title={t("runDetail.data")}>
        {!s.run ? <Empty text={na} /> : (
          <DataTable head={[t("preflight.field"), t("preflight.valueCol")]} rows={[
            [t("runs.code"), s.run.run_code], [t("runs.status"), t(`runStatus.${s.run.status}`)],
            [t("runs.start"), when(s.run.started_at)], [t("runs.end"), when(s.run.ended_at)],
            [t("audit.createdBy"), who(s.run.created_by)],
            [t("audit.operator"), who(s.run.operator_id)],
            [t("audit.organizationSite"), s.organization ? `${s.organization.name} · ${s.site?.name ?? na}` : na],
            [t("audit.machine"), s.machine ? `${[s.machine.manufacturer, s.machine.model].filter(Boolean).join(" ") || na} · ${t("audit.serial")} ${s.machine.serial_number ?? na}` : na],
            [t("audit.recipeVersion"), s.recipe_version ? `${s.recipe_version.recipe} v${s.recipe_version.version} (${t(`recipes.status.${s.recipe_version.status}`)})` : na],
          ]} />
        )}
      </Panel>

      <Panel title={t("audit.decisionApproval")}>
        {!s.plan ? <Empty text={t("runDetail.noPlan")} /> : (
          <DataTable head={[t("preflight.field"), t("preflight.valueCol")]} rows={[
            [t("preflight.rpm"), n(s.plan.screw_rpm)], [t("preflight.feed"), n(s.plan.feed_kg_h)],
            [t("preflight.water"), n(s.plan.water_kg_h)], [t("preflight.steam"), n(s.plan.steam_kg_h)],
            [t("preflight.cutterRpm"), n(s.plan.cutter_rpm)], [t("preflight.zones"), (s.plan.zone_setpoints_c ?? []).join(", ") || na],
            [t("preflight.engineDecision"), s.plan.decision.status ? t(`dashboard.decision.${s.plan.decision.status}`) : na],
            [t("audit.decidedAt"), when(s.plan.decision.decided_at)],
            [t("audit.risks"), (s.plan.decision.risk_categories ?? []).join(", ") || "—"],
            [t("audit.missingInputs"), (s.plan.decision.missing_inputs ?? []).join(", ") || "—"],
            [t("preflight.approval"), s.plan.approval.approved_at ? t("preflight.approved") : t("preflight.notApproved")],
            [t("audit.approvedBy"), who(s.plan.approval.approved_by)], [t("audit.approvedAt"), when(s.plan.approval.approved_at)],
          ]} />
        )}
      </Panel>

      <Panel title={t("console.dataFiles")}>
        {s.files.length === 0 ? <Empty text={t("console.noFiles")} /> : (
          <DataTable head={[t("audit.file"), "SHA-256", t("audit.rows"), t("audit.time"), t("audit.user")]}
            rows={s.files.map((f) => [f.filename, <span key="h" className="num break-all">{f.sha256}</span>, n(f.row_count), when(f.created_at), who(f.created_by)])} />
        )}
      </Panel>

      <Panel title={t("audit.qualityDiagnosis")}>
        {s.quality.length + s.state_snapshots.length + s.diagnoses.length === 0 ? <Empty text={t("runDetail.noQuality")} /> : (
          <DataTable head={[t("audit.entry"), t("audit.result"), t("audit.time"), t("audit.user")]} rows={[
            ...s.quality.map((q) => [`${t("audit.qualityEntry")} (${q.ruleset_version})`, t(`quality.verdict.${q.verdict}`), when(q.created_at), who(q.created_by)]),
            ...s.state_snapshots.map((x) => [`${t("audit.snapshotEntry")} (${x.schema_version})`, <span key="h" className="num">{x.sha256.slice(0, 16)}…</span>, when(x.created_at), who(x.created_by)]),
            ...s.diagnoses.map((d) => [`${t("audit.diagnosisEntry")} (${d.gates_version})`, d.status, when(d.created_at), who(d.created_by)]),
          ]} />
        )}
      </Panel>

      <Panel title={t("runDetail.pva")}>
        {s.predictions.length === 0 ? <Empty text={t("runDetail.noPredictions")} /> : (
          <DataTable head={[t("runDetail.metric"), t("runDetail.predicted"), t("audit.time")]}
            rows={s.predictions.map((p) => [`${p.metric} [${p.unit}]`,
              p.kind === "RANGE" ? <span key="v" className="num">{p.min_value} … {p.max_value}</span> : n(p.value), when(p.created_at)])} />
        )}
      </Panel>

      <Panel title={t("runDetail.measurements")}>
        {s.measurements.length === 0 ? <Empty text={t("runDetail.noMeasurements")} /> : (
          <DataTable head={[t("runDetail.sample"), t("runDetail.metric"), t("preflight.valueCol"), t("audit.time"), t("audit.user")]}
            rows={s.measurements.map((m) => [m.sample_code, m.parameter, <span key="v" className="num">{m.value} {m.unit ?? ""}</span>, when(m.created_at), who(m.created_by)])} />
        )}
      </Panel>

      <Panel title={t("runDetail.verification")}>
        {s.verifications.length === 0 ? <Empty text={t("runDetail.noVerification")} /> : (
          <DataTable head={[t("runDetail.kind"), t("audit.result"), t("runDetail.evidence"), t("audit.time")]}
            rows={s.verifications.map((v) => [t(`dashboard.verificationKind.${v.kind}`), t(`dashboard.verificationState.${v.state}`),
              v.evidence_saved ? t("runDetail.evidenceSaved") : t("runDetail.evidenceNotSaved"), when(v.verified_at)])} />
        )}
      </Panel>
    </div>
  );
}
