import { notFound } from "next/navigation";
import { getT } from "@/lib/i18n";
import { PLACEHOLDER_SECTIONS } from "@/lib/nav";

export default async function SectionPlaceholder({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!PLACEHOLDER_SECTIONS.includes(section)) notFound();
  const { t } = await getT();
  return (
    <section className="max-w-2xl">
      <h1 className="text-xl font-semibold">{t(`nav.${section}`)}</h1>
      <p className="mt-2 text-sm text-muted">{t("placeholder.body")}</p>
      {(section === "machine-console" || section === "preflight") && (
        <p className="mt-4 rounded border border-line bg-panel px-3 py-2 text-sm">{t("common.plcNotice")}</p>
      )}
    </section>
  );
}
