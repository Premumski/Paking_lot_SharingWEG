import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { getClockOffset, now } from "@/lib/clock";
import { formatDateTime } from "@/i18n/server";
import { syncClock } from "@/lib/jobs";

export async function DevClockBanner() {
  await syncClock();
  const t = await getTranslations("dev");
  const locale = await getLocale();
  const offset = getClockOffset();
  return (
    <div className="bg-amber-100 px-4 py-1 text-center text-xs text-amber-900">
      {t("bannerTestMode")}{" "}
      {offset !== 0 ? <strong>{t("bannerClock", { time: formatDateTime(now(), locale) })}</strong> : null}{" "}
      <Link href="/dev" className="underline">{t("open")}</Link>
    </div>
  );
}
