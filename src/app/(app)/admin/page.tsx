import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { now } from "@/lib/clock";
import { formatDateTime } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getTranslations("admin"))("title") };
}

export default async function AdminHome() {
  const t = await getTranslations("admin");
  const locale = await getLocale();
  const t0 = now();
  const [users, spots, upcoming, requested, problems, deletion, paymentIssues] = await Promise.all([
    prisma.user.count({ where: { status: { not: "DELETED" } } }),
    prisma.parkingSpot.count(),
    prisma.booking.count({ where: { status: "CONFIRMED", endsAt: { gt: t0 } } }),
    prisma.booking.count({ where: { status: "REQUESTED" } }),
    prisma.problemReport.count({ where: { resolvedAt: null } }),
    prisma.user.findMany({ where: { deletionRequestedAt: { not: null }, status: { not: "DELETED" } } }),
    prisma.booking.count({ where: { status: "CONFIRMED", paymentStatus: "FAILED" } }),
  ]);
  const stats: [string, number, string][] = [
    ["users", users, "/admin/users"],
    ["spots", spots, "/admin/spots"],
    ["upcoming", upcoming, "/admin/bookings?status=CONFIRMED"],
    ["requested", requested, "/admin/bookings?status=REQUESTED"],
    ["openProblems", problems, "/admin/problems"],
    ["paymentIssues", paymentIssues, "/admin/bookings?payment=FAILED"],
  ];
  return (
    <div className="space-y-4">
      <h1 className="h1">{t("title")}</h1>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {stats.map(([k, v, href]) => (
          <li key={k}>
            <Link href={href} className="card block hover:border-brand-600">
              <span className="block text-2xl font-bold">{v}</span>
              <span className="text-sm text-slate-600">{t(`stats.${k}`)}</span>
            </Link>
          </li>
        ))}
      </ul>
      {deletion.length ? (
        <div className="card">
          <h2 className="h2 mb-2">{t("deletionRequests")}</h2>
          <ul className="space-y-1 text-sm">
            {deletion.map((u) => (
              <li key={u.id}><Link className="text-brand-700 underline" href={`/admin/users/${u.id}`}>{u.name}</Link> · {formatDateTime(u.deletionRequestedAt!, locale)}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
