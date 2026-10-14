// Shared by server and client code (no "use client" here, so Server Components can call translate()).
import { es } from "./es";

export type Locale = "en" | "es";
export const LOCALE_COOKIE = "next-locale";

/** English text is the key; missing translations fall back to English. "{name}" placeholders come from vars. */
export function translate(locale: Locale, text: string, vars?: Record<string, string | number>) {
  const s = locale === "es" ? (es[text] ?? text) : text;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}
