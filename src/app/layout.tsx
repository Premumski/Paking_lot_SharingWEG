import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common");
  return {
    title: { default: t("appName"), template: `%s · ${t("appName")}` },
    description: t("tagline"),
    manifest: "/manifest.webmanifest",
    icons: { icon: "/icons/icon.svg", apple: "/icons/icon-192.png" },
    robots: { index: false, follow: false },
  };
}

// Q-03: allow user zoom (no maximum-scale)
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#1d5fd1" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages} timeZone="Europe/Berlin">
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
