"use client";

// Minimal EN/ES i18n. English text is the key: t("Join") returns the Spanish string when the locale is "es"
// and falls back to the English text when a translation is missing. "{name}" placeholders are filled from vars.
// The locale lives in a cookie so the server renders the same language the browser shows (no hydration flash).
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { LOCALE_COOKIE, translate, type Locale } from "./core";

export type { Locale };

type Ctx = { locale: Locale; setLocale: (l: Locale) => void; t: (text: string, vars?: Record<string, string | number>) => string };
const I18n = createContext<Ctx>({ locale: "en", setLocale: () => {}, t: (s, v) => translate("en", s, v) });

export function I18nProvider({ initial, children }: { initial: Locale; children: ReactNode }) {
  const [locale, setState] = useState<Locale>(initial);
  const setLocale = useCallback((l: Locale) => {
    setState(l);
    document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    document.documentElement.lang = l;
  }, []);
  const t = useCallback((text: string, vars?: Record<string, string | number>) => translate(locale, text, vars), [locale]);
  return <I18n.Provider value={{ locale, setLocale, t }}>{children}</I18n.Provider>;
}

export const useI18n = () => useContext(I18n);
export const useT = () => useContext(I18n).t;

/** EN · ES switch for the nav. */
export function LocaleToggle({ className = "" }: { className?: string }) {
  const { locale, setLocale } = useI18n();
  const router = useRouter();
  // Server Components read the cookie, so refresh them after switching.
  const pick = (l: "en" | "es") => { if (l !== locale) { setLocale(l); router.refresh(); } };
  return (
    <div role="group" aria-label="Language" className={`inline-flex rounded-full tactile-pressed p-0.5 text-xs font-semibold ${className}`}>
      {(["en", "es"] as const).map((l) => (
        <button key={l} type="button" aria-pressed={locale === l} onClick={() => pick(l)}
          className={`rounded-full px-2.5 py-1 uppercase transition-colors ${locale === l ? "bg-volt text-ink" : "text-mute hover:text-paper"}`}>
          {l}
        </button>
      ))}
    </div>
  );
}
