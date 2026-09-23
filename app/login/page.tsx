import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n";
import { createSupabaseServer } from "@/lib/supabase/server";
import { LoginForm } from "@/components/login-form";
import { LangSwitch } from "@/components/lang-switch";

export default async function LoginPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");
  const { t, locale } = await getT();
  const labels = {
    email: t("login.email"), password: t("login.password"), signIn: t("login.signIn"), signUp: t("login.signUp"),
    toSignUp: t("login.toSignUp"), toSignIn: t("login.toSignIn"), checkEmail: t("login.checkEmail"), failed: t("login.failed"),
  };
  return (
    <main className="mx-auto grid min-h-screen max-w-5xl grid-cols-1 items-center gap-12 px-6 py-12 md:grid-cols-[1fr_380px]">
      <section>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{t("app.title")}</h1>
        <p className="mt-3 max-w-md text-lg text-muted">{t("app.subtitle")}</p>
        <ul className="mt-8 space-y-3 border-l border-line pl-4 text-sm">
          <li>{t("app.points.preflight")}</li>
          <li>{t("app.points.verify")}</li>
          <li>{t("app.points.evidence")}</li>
        </ul>
        <p className="mt-10 text-xs text-muted">{t("app.footer")}</p>
      </section>
      <section className="rounded-md border border-line bg-panel p-6">
        <div className="mb-6 flex justify-end"><LangSwitch locale={locale} label={t("top.language")} /></div>
        <LoginForm labels={labels} />
      </section>
    </main>
  );
}
