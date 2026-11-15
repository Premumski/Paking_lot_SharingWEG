import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { Nav, type NavItem } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { logoutAction } from "@/app/actions/auth";
import { getTranslations } from "next-intl/server";
import { DevClockBanner } from "@/components/DevClockBanner";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  const t = await getTranslations("nav");
  const [spotCount, pendingAsOwner] = await Promise.all([
    prisma.parkingSpot.count({ where: { ownerId: user.id } }),
    prisma.booking.count({ where: { ownerId: user.id, status: "REQUESTED" } }),
  ]);
  const items: NavItem[] = [
    { href: "/", key: "search" },
    { href: "/bookings", key: "bookings", badge: pendingAsOwner || undefined },
  ];
  if (spotCount > 0) items.push({ href: "/my-spots", key: "mySpots" });
  items.push({ href: "/earnings", key: "money" }, { href: "/profile", key: "profile" });
  if (user.role === "ADMIN") items.push({ href: "/admin", key: "admin" });
  if (env.devTools) items.push({ href: "/dev", key: "dev" });
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:p-2">
        {t("skipToContent")}
      </a>
      {env.devTools ? <DevClockBanner /> : null}
      <Nav items={items} userName={user.name} logout={logoutAction} />
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        {children}
      </main>
      <Footer />
    </div>
  );
}
