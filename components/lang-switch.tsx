import { setLocale } from "@/server/actions";
import type { Locale } from "@/lib/i18n";

export function LangSwitch({ locale, label }: { locale: Locale; label: string }) {
  return (
    <form action={setLocale} aria-label={label} className="flex overflow-hidden rounded border border-line text-xs">
      {(["pl", "en"] as const).map((l) => (
        <button
          key={l}
          name="locale"
          value={l}
          aria-pressed={l === locale}
          className={`px-2 py-1 ${l === locale ? "bg-panel-2 text-ink" : "text-muted hover:text-ink"}`}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </form>
  );
}
