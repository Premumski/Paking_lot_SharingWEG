import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { isLocale, LOCALE_COOKIE, negotiateLocale } from "./config";
import { loadMessages } from "./messages";

// L-01: language from the profile (mirrored into a cookie at login / profile change), else the browser language.
export default getRequestConfig(async () => {
  const jar = await cookies();
  const fromCookie = jar.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(fromCookie) ? fromCookie : negotiateLocale((await headers()).get("accept-language"));
  return { locale, messages: loadMessages(locale), timeZone: "Europe/Berlin" };
});
