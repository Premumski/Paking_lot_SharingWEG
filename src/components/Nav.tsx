"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";

export interface NavItem {
  href: string;
  key: string;
  badge?: number;
}

export function Nav({ items, userName, logout }: { items: NavItem[]; userName: string; logout: () => Promise<void> }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-2">
        <Link href="/" className="flex items-center gap-2 font-bold text-brand-700">
          <img src="/icons/icon.svg" alt="" width={28} height={28} />
          <span className="hidden sm:inline">{t("brand")}</span>
        </Link>
        <nav aria-label={t("main")} className="hidden flex-1 justify-center lg:flex">
          <ul className="flex gap-1">
            {items.map((i) => (
              <li key={i.href}>
                <Link
                  href={i.href}
                  aria-current={active(i.href) ? "page" : undefined}
                  className={`relative whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-medium ${active(i.href) ? "bg-brand-50 text-brand-700" : "text-slate-700 hover:bg-slate-100"}`}
                >
                  {t(i.key)}
                  {i.badge ? <span className="ml-1 rounded-full bg-red-600 px-1.5 text-xs text-white">{i.badge}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-2">
          <span className="hidden whitespace-nowrap text-sm text-slate-600 2xl:inline">{userName}</span>
          <form action={logout} className="hidden lg:block">
            <button className="btn-secondary btn-small">{t("logout")}</button>
          </form>
          <button
            type="button"
            className="btn-secondary btn-small lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((o) => !o)}
          >
            {t("menu")}
          </button>
        </div>
      </div>
      {open ? (
        <nav id="mobile-nav" aria-label={t("main")} className="border-t border-slate-200 lg:hidden">
          <ul className="flex flex-col p-2">
            {items.map((i) => (
              <li key={i.href}>
                <Link
                  href={i.href}
                  onClick={() => setOpen(false)}
                  aria-current={active(i.href) ? "page" : undefined}
                  className={`block rounded-lg px-3 py-3 text-base ${active(i.href) ? "bg-brand-50 font-semibold text-brand-700" : "text-slate-800"}`}
                >
                  {t(i.key)}
                  {i.badge ? <span className="ml-2 rounded-full bg-red-600 px-1.5 text-xs text-white">{i.badge}</span> : null}
                </Link>
              </li>
            ))}
            <li>
              <form action={logout}>
                <button className="w-full rounded-lg px-3 py-3 text-left text-base text-slate-800">{t("logout")}</button>
              </form>
            </li>
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
