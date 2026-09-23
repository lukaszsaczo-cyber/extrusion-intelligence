import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n";
import { getSessionContext } from "@/server/context";
import { getEngineHealth } from "@/server/engine";
import { signOut } from "@/server/actions";
import { Sidebar } from "@/components/sidebar";
import { NAV } from "@/lib/nav";
import { LangSwitch } from "@/components/lang-switch";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  const [{ t, locale }, engine] = await Promise.all([getT(), getEngineHealth()]);
  const labels = Object.fromEntries(NAV.map((s) => [s, t(`nav.${s}`)]));
  const org = ctx.current;

  return (
    <div className="min-h-screen md:grid md:grid-cols-[220px_1fr]">
      <aside className="border-b border-line bg-panel px-3 py-4 md:min-h-screen md:border-r md:border-b-0">
        <div className="mb-4 px-3 text-sm font-semibold">{t("app.title")}</div>
        <details className="md:hidden">
          <summary className="cursor-pointer px-3 py-2 text-sm text-muted">Menu</summary>
          <Sidebar labels={labels} />
        </details>
        <div className="hidden md:block"><Sidebar labels={labels} /></div>
      </aside>
      <div className="min-w-0">
        <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line px-6 py-3 text-sm">
          <span><span className="text-muted">{t("top.organization")}: </span>{org?.organizationName || t("common.notAvailable")}</span>
          <span><span className="text-muted">{t("top.role")}: </span>{org ? t(`role.${org.role}`) : t("common.notAvailable")}</span>
          <span className="flex items-center gap-2">
            <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${engine.connected ? "bg-teal" : "bg-unknown"}`} />
            <span className="text-muted">{t("top.engine")}: </span>
            {engine.connected ? t("engine.connected") : t("engine.notConnected")}
          </span>
          <span className="ml-auto flex items-center gap-3">
            <span className="hidden text-muted sm:inline">{ctx.email}</span>
            <LangSwitch locale={locale} label={t("top.language")} />
            <form action={signOut}><button className="text-muted hover:text-ink">{t("top.signOut")}</button></form>
          </span>
        </header>
        <main className="px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
