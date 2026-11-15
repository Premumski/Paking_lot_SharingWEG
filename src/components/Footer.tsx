import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LanguageSwitcher } from "./LanguageSwitcher";

// S-08: imprint and privacy policy reachable without login.
export async function Footer() {
  const t = await getTranslations("common");
  return (
    <footer className="mx-auto mt-10 flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 pb-8 text-xs text-slate-500">
      <nav className="flex gap-4" aria-label={t("legal")}>
        <Link href="/legal/imprint" className="hover:underline">{t("imprint")}</Link>
        <Link href="/legal/privacy" className="hover:underline">{t("privacy")}</Link>
        <a href="https://github.com/" className="hover:underline" rel="noreferrer">{t("openSource")}</a>
      </nav>
      <LanguageSwitcher />
    </footer>
  );
}
