import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Footer } from "./Footer";

export async function PublicShell({ children, title }: { children: React.ReactNode; title: string }) {
  const t = await getTranslations("common");
  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto w-full max-w-md flex-1 px-4 pt-10 sm:pt-16">
        <Link href="/" className="mb-6 flex items-center gap-2 text-brand-700">
          <img src="/icons/icon.svg" alt="" width={36} height={36} />
          <span className="text-lg font-bold">{t("appName")}</span>
        </Link>
        <div className="card">
          <h1 className="h1 mb-4">{title}</h1>
          {children}
        </div>
      </main>
      <Footer />
    </div>
  );
}
