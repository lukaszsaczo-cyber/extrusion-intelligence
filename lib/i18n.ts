import "server-only";
import { cookies } from "next/headers";
import pl from "@/messages/pl.json";
import en from "@/messages/en.json";

export const LOCALES = ["pl", "en"] as const; // DE/FR: add messages/<l>.json + entry here.
export type Locale = (typeof LOCALES)[number];
export const LOCALE_COOKIE = "ei_locale";

const DICTS: Record<Locale, unknown> = { pl, en };

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

export async function getLocale(): Promise<Locale> {
  const v = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(v) ? v : "pl";
}

export type T = (key: string) => string;

export async function getT(): Promise<{ t: T; locale: Locale }> {
  const locale = await getLocale();
  const dict = DICTS[locale];
  const t: T = (key) => {
    let cur: unknown = dict;
    for (const part of key.split(".")) {
      if (cur && typeof cur === "object" && part in (cur as Record<string, unknown>)) {
        cur = (cur as Record<string, unknown>)[part];
      } else {
        return key; // visible, and caught by scripts/check-i18n.mjs for static keys
      }
    }
    return typeof cur === "string" ? cur : key;
  };
  return { t, locale };
}
