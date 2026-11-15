import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { Markdown } from "@/components/Markdown";
import { Footer } from "@/components/Footer";
import Link from "next/link";

// S-08: imprint and privacy policy without login.
export default async function LegalPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (key !== "imprint" && key !== "privacy") notFound();
  const locale = await getLocale();
  const t = await getTranslations("common");
  const page = await prisma.legalPage.findUnique({ where: { key } });
  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-3xl px-4 py-10">
        <Link href="/" className="text-sm text-brand-700 hover:underline">← {t("appName")}</Link>
        <div className="card mt-4">
          {page ? <Markdown text={locale === "en" ? page.bodyEn : page.bodyDe} /> : <p>{t("notMaintained")}</p>}
        </div>
      </main>
      <Footer />
    </div>
  );
}
