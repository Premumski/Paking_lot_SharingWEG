import { getLocale, getTranslations } from "next-intl/server";
import { setLanguageAction } from "@/app/actions/auth";

export async function LanguageSwitcher() {
  const locale = await getLocale();
  const t = await getTranslations("common");
  return (
    <form action={setLanguageAction} className="inline-flex items-center gap-1" aria-label={t("language")}>
      {(["de", "en"] as const).map((l) => (
        <button
          key={l}
          name="locale"
          value={l}
          className={`rounded px-2 py-1 text-xs font-semibold ${locale === l ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-200"}`}
          aria-pressed={locale === l}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </form>
  );
}
