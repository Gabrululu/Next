import { cookies } from "next/headers";
import { LOCALE_COOKIE, translate, type Locale } from "./core";

/** Locale for Server Components, from the same cookie the toggle writes. */
export async function getLocale(): Promise<Locale> {
  return (await cookies()).get(LOCALE_COOKIE)?.value === "es" ? "es" : "en";
}

export async function getT() {
  const locale = await getLocale();
  return (text: string, vars?: Record<string, string | number>) => translate(locale, text, vars);
}
