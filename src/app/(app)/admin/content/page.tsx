import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/i18n/server";
import { CONTRACT_PLACEHOLDERS } from "@/lib/markdown";
import { saveContractTemplateAction, saveLegalPageAction } from "@/app/actions/admin";
import { TwoLanguageForm } from "../AdminForms";

// A-05 / V-01
export default async function AdminContent() {
  const t = await getTranslations("admin");
  const locale = await getLocale();
  const [tpl, imprint, privacy] = await Promise.all([
    prisma.contractTemplate.findFirst({ orderBy: { version: "desc" } }),
    prisma.legalPage.findUnique({ where: { key: "imprint" } }),
    prisma.legalPage.findUnique({ where: { key: "privacy" } }),
  ]);
  return (
    <div className="space-y-4">
      <h1 className="h1">{t("content")}</h1>
      <section className="card space-y-2">
        <h2 className="h2">{t("contractTemplate")}</h2>
        <p className="text-sm">{tpl ? t("templateVersion", { version: tpl.version, date: formatDateTime(tpl.createdAt, locale) }) : t("noTemplate")}</p>
        <TwoLanguageForm
          action={saveContractTemplateAction}
          de={tpl?.bodyDe ?? ""}
          en={tpl?.bodyEn ?? ""}
          rows={20}
          hint={t("placeholders", { list: CONTRACT_PLACEHOLDERS.map((p) => `{{${p}}}`).join(", ") })}
        />
      </section>
      <section className="card space-y-2">
        <h2 className="h2">{t("imprint")}</h2>
        <TwoLanguageForm action={saveLegalPageAction.bind(null, "imprint")} de={imprint?.bodyDe ?? ""} en={imprint?.bodyEn ?? ""} rows={10} hint={t("markdownHint")} />
      </section>
      <section className="card space-y-2">
        <h2 className="h2">{t("privacy")}</h2>
        <TwoLanguageForm action={saveLegalPageAction.bind(null, "privacy")} de={privacy?.bodyDe ?? ""} en={privacy?.bodyEn ?? ""} rows={14} hint={t("markdownHint")} />
      </section>
    </div>
  );
}
