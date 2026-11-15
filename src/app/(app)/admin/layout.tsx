import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/auth";

const LINKS = ["", "users", "spots", "plan", "settings", "content", "bookings", "problems", "audit"] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const t = await getTranslations("admin");
  return (
    <div className="space-y-4">
      <nav aria-label={t("nav")} className="-mx-4 overflow-x-auto px-4">
        <ul className="flex gap-1 whitespace-nowrap">
          {LINKS.map((l) => (
            <li key={l}>
              <Link href={`/admin${l ? `/${l}` : ""}`} className="btn-secondary btn-small">{t(`menu.${l || "overview"}`)}</Link>
            </li>
          ))}
        </ul>
      </nav>
      {children}
    </div>
  );
}
