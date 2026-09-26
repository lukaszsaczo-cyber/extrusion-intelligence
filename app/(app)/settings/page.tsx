import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n";
import { getSessionContext } from "@/server/context";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSite, renameOrganization } from "@/server/actions";
import { getEngineHealth } from "@/server/engine";
import { peopleNames } from "@/server/people";
import { ACTIONS, PERMISSIONS, ROLES } from "@/lib/settings/permissions";
import { RULESET_V0 } from "@/lib/quality/rules";
import { GATES_VERSION, MIN_CLEAN_SAMPLES } from "@/lib/diagnosis/gates";
import { DataTable, Empty, Field, FormGrid, Notice, PageHeader, Panel, formErrorKey } from "@/components/ui";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { t } = await getT();
  const ctx = await getSessionContext();
  if (!ctx?.current) redirect("/dashboard");
  const org = ctx.current;
  const isAdmin = org.role === "ADMIN";
  const errorKey = formErrorKey((await searchParams).e);

  const supabase = await createSupabaseServer();
  const [sitesRes, membersRes, engine] = await Promise.all([
    supabase.from("sites").select("id, name, timezone").eq("organization_id", org.organizationId).order("name"),
    supabase.from("organization_members").select("user_id, role").eq("organization_id", org.organizationId),
    getEngineHealth(),
  ]);
  const sites = (sitesRes.data ?? []) as { id: string; name: string; timezone: string | null }[];
  const members = (membersRes.data ?? []) as { user_id: string; role: string }[];
  const na = t("common.notAvailable");
  const name = await peopleNames(supabase, members.map((m) => m.user_id));

  return (
    <div className="space-y-6">
      <PageHeader title={t("settings.title")} />
      {errorKey && <p className="text-sm text-stop">{t(errorKey)}</p>}

      <Panel title={t("settings.organization")}>
        {isAdmin ? (
          <FormGrid action={renameOrganization} submit={t("form.save")}>
            <label className="block text-sm">
              <span className="mb-1 block text-muted">{t("settings.orgName")}</span>
              <input name="name" required maxLength={200} defaultValue={org.organizationName}
                className="w-full rounded border border-line bg-ground px-3 py-2 text-sm outline-none focus:border-teal" />
            </label>
          </FormGrid>
        ) : <Notice text={org.organizationName || na} />}
      </Panel>

      <Panel title={t("settings.sites")}>
        {sites.length === 0 ? <Empty text={t("settings.noSites")} /> : (
          <DataTable head={[t("settings.siteName"), t("settings.timezone")]}
            rows={sites.map((s) => [s.name, s.timezone ?? na])} />
        )}
        {isAdmin && (
          <div className="border-t border-line">
            <FormGrid action={createSite} submit={t("settings.addSite")}>
              <Field label={t("settings.siteName")} name="name" required />
              <Field label={t("settings.timezone")} name="timezone" maxLength={64} />
            </FormGrid>
          </div>
        )}
      </Panel>

      <Panel title={t("settings.members")}>
        <DataTable head={[t("settings.user"), t("settings.role")]}
          rows={members.map((m) => [
            <span key="u" className="num">
              {m.user_id === ctx.userId ? `${ctx.email ?? name(m.user_id)} (${t("settings.you")})` : name(m.user_id)}
            </span>,
            t(`role.${m.role}`),
          ])} />
      </Panel>

      <Panel title={t("settings.permissions")}>
        <Notice text={t("settings.permissionsHint")} />
        <DataTable head={[t("settings.action"), ...ROLES.map((r) => t(`role.${r}`))]}
          rows={ACTIONS.map((a) => [
            t(`settings.perm.${a}`),
            ...ROLES.map((r) => (PERMISSIONS[a] as readonly string[]).includes(r)
              ? <span key={r} className="text-teal">✓</span> : <span key={r} className="text-muted">—</span>),
          ])} />
      </Panel>

      <Panel title={t("settings.configuration")}>
        <DataTable head={[t("preflight.field"), t("preflight.valueCol")]} rows={[
          [t("settings.engine"), engine.connected ? t("engine.connected") : t("engine.notConnected")],
          [t("settings.ruleset"), <span key="r" className="num">{RULESET_V0.version}</span>],
          [t("settings.rulesetParams"), <span key="p" className="num">
            {`minValidSamples=${RULESET_V0.minValidSamples}, gapFactor=${RULESET_V0.gapFactor}, minCoverage=${RULESET_V0.minCoverage}`}</span>],
          [t("settings.gates"), <span key="g" className="num">{`${GATES_VERSION}, MIN_CLEAN_SAMPLES=${MIN_CLEAN_SAMPLES}`}</span>],
          [t("settings.auditFormat"), <span key="a" className="num">audit-v3 · SHA-256</span>],
        ]} />
        <Notice text={t("settings.configurationHint")} />
      </Panel>
    </div>
  );
}
