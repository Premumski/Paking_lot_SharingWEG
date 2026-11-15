import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import type { Booking, ParkingSpot, User } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { now } from "@/lib/clock";
import { formatDateTime } from "@/i18n/server";
import { formatEuro } from "@/lib/domain/pricing";
import { displayStatus } from "@/lib/booking/visibility";
import { PaymentBadge, StatusBadge } from "@/components/StatusBadge";
import { ActionButton } from "@/components/ActionButton";
import { confirmAction, declineAction } from "@/app/actions/bookings";

type Row = Booking & { spot: ParkingSpot; tenant: User; contracts: { locale: string }[] };

export async function generateMetadata() {
  return { title: (await getTranslations("bookings"))("title") };
}

// B-08: upcoming and past bookings in both roles.
export default async function BookingsPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const { user } = await requireUser();
  const t = await getTranslations("bookings");
  const locale = await getLocale();
  const role = (await searchParams).role === "owner" ? "owner" : "tenant";
  const where = role === "owner" ? { ownerId: user.id } : { tenantId: user.id };
  const rows = (await prisma.booking.findMany({
    where: { ...where, ...(role === "owner" ? { status: { not: "DRAFT" as const } } : {}) },
    include: { spot: true, tenant: true, contracts: { select: { locale: true } } },
    orderBy: { startsAt: "asc" },
    take: 300,
  })) as Row[];
  const t0 = now();
  const upcoming = rows.filter((b) => b.endsAt > t0 && ["DRAFT", "REQUESTED", "CONFIRMED"].includes(b.status));
  const past = rows.filter((b) => !upcoming.includes(b)).reverse();
  const pendingOwner = await prisma.booking.count({ where: { ownerId: user.id, status: "REQUESTED" } });

  const table = (list: Row[], caption: string) => (
    <div className="card overflow-x-auto p-0 sm:p-0">
      <table className="table">
        <caption className="px-3 py-2 text-left font-semibold">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{t("spot")}</th>
            <th scope="col">{t("period")}</th>
            <th scope="col">{t("status")}</th>
            <th scope="col">{t("price")}</th>
            <th scope="col">{t("actions")}</th>
          </tr>
        </thead>
        <tbody>
          {list.length === 0 ? (
            <tr><td colSpan={5} className="text-slate-500">{t("none")}</td></tr>
          ) : (
            list.map((b) => (
              <tr key={b.id}>
                <td>
                  <strong>{b.spot.planNumber}</strong>
                  {role === "owner" ? <div className="text-xs text-slate-500">{b.tenant.name}</div> : null}
                </td>
                <td className="whitespace-nowrap text-xs">{formatDateTime(b.startsAt, locale)}<br />{formatDateTime(b.endsAt, locale)}</td>
                <td className="space-y-1">
                  <StatusBadge status={displayStatus(b)} /> <PaymentBadge status={b.paymentStatus} />
                </td>
                <td>{formatEuro(b.priceCents, locale)}</td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    <Link className="btn-secondary btn-small" href={`/bookings/${b.id}`}>{t("details")}</Link>
                    {b.contracts.length ? (
                      <a className="btn-secondary btn-small" href={`/api/contracts/${b.id}`}>{t("contract")}</a>
                    ) : null}
                    {role === "owner" && b.status === "REQUESTED" ? (
                      <>
                        <ActionButton action={confirmAction.bind(null, b.id)} label={t("confirm")} />
                        <ActionButton action={declineAction.bind(null, b.id)} label={t("decline")} className="btn-secondary btn-small" />
                      </>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-4">
      <h1 className="h1">{t("title")}</h1>
      <div className="flex gap-2" role="tablist">
        <Link role="tab" aria-selected={role === "tenant"} href="/bookings" className={role === "tenant" ? "btn-primary btn-small" : "btn-secondary btn-small"}>{t("asTenant")}</Link>
        <Link role="tab" aria-selected={role === "owner"} href="/bookings?role=owner" className={role === "owner" ? "btn-primary btn-small" : "btn-secondary btn-small"}>
          {t("asOwner")}{pendingOwner ? ` (${pendingOwner})` : ""}
        </Link>
      </div>
      {table(upcoming, t("upcoming"))}
      {table(past, t("past"))}
    </div>
  );
}
