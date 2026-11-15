import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { now } from "@/lib/clock";
import { formatEuro } from "@/lib/domain/pricing";

export async function generateMetadata() {
  return { title: (await getTranslations("mySpots"))("title") };
}

export default async function MySpotsPage() {
  const { user } = await requireUser();
  const t = await getTranslations("mySpots");
  const locale = await getLocale();
  const spots = await prisma.parkingSpot.findMany({
    where: { ownerId: user.id },
    orderBy: { planNumber: "asc" },
    include: {
      _count: { select: { rules: true } },
      bookings: { where: { status: { in: ["REQUESTED", "CONFIRMED"] }, endsAt: { gt: now() } }, select: { status: true } },
    },
  });
  return (
    <div className="space-y-4">
      <h1 className="h1">{t("title")}</h1>
      {!user.paymentOnboarded ? <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm">{t("freeOnlyHint")} <Link href="/earnings" className="text-brand-700 underline">{t("connectAccount")}</Link></p> : null}
      <ul className="grid gap-3 sm:grid-cols-2">
        {spots.map((s) => (
          <li key={s.id} className="card">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="h2">{s.planNumber} · {s.label}</h2>
                <p className="text-sm text-slate-600">
                  {formatEuro(s.pricePerHourCents, locale)}/h · {formatEuro(s.pricePerDayCents, locale)}/{t("day")}
                </p>
              </div>
              {s.paused ? <span className="badge bg-amber-100 text-amber-900">{t("paused")}</span> : <span className="badge bg-green-100 text-green-800">{t("active")}</span>}
            </div>
            <p className="mt-2 text-sm">
              {t("summary", {
                rules: s._count.rules,
                requests: s.bookings.filter((b) => b.status === "REQUESTED").length,
                confirmed: s.bookings.filter((b) => b.status === "CONFIRMED").length,
              })}
            </p>
            <p className="text-xs text-slate-500">{s.instantBooking ? t("instantOn") : t("instantOff")}</p>
            <Link href={`/my-spots/${s.id}`} className="btn-primary btn-small mt-3">{t("manage")}</Link>
          </li>
        ))}
      </ul>
      {spots.length === 0 ? <p className="card text-sm">{t("noSpots")}</p> : null}
    </div>
  );
}
