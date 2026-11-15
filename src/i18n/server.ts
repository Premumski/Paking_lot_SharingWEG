import { createTranslator } from "next-intl";
import { isLocale, type Locale } from "./config";
import { loadMessages } from "./messages";

/** Translator for a fixed locale outside of a request (e-mails, PDFs, jobs). */
export function translatorFor(locale: string | null | undefined, namespace?: string) {
  const l: Locale = isLocale(locale) ? locale : "de";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createTranslator({ locale: l, messages: loadMessages(l) as any, namespace: namespace as any, timeZone: "Europe/Berlin" }) as unknown as (
    key: string,
    values?: Record<string, string | number | Date>,
  ) => string;
}

export function formatDateTime(date: Date, locale: string) {
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "de-DE", {
    timeZone: "Europe/Berlin",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatDate(date: Date, locale: string) {
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}
