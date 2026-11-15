import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/i18n/server";
import { formatEuro } from "@/lib/domain/pricing";
import { BOOKING_STATUSES, PAYMENT_STATUSES, bookingFilter } from "@/lib/admin-queries";

export default async function AdminBookings({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const t = await getTranslations("admin");
  const tp = await getTranslations("paymentStatus");
  const tb = await getTranslations("bookingStatusRaw");
  const locale = await getLocale();
  const [rows, spots, users] = await Promise.all([
    prisma.booking.findMany({ where: bookingFilter(sp), include: { spot: true, tenant: true }, orderBy: { startsAt: "desc" }, take: 500 }),
    prisma.parkingSpot.findMany({ orderBy: { planNumber: "asc" }, select: { id: true, planNumber: true } }),
    prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const names = new Map(users.map((u) => [u.id, u.name]));
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();
  return (
    <div className="space-y-4">
      <h1 className="h1">{t("bookings")}</h1>
      <form method="get" className="card grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div><label className="label" htmlFor="f-from">{t("filterFrom")}</label><input className="input" id="f-from" type="date" name="from" defaultValue={sp.from} /></div>
        <div><label className="label" htmlFor="f-to">{t("filterTo")}</label><input className="input" id="f-to" type="date" name="to" defaultValue={sp.to} /></div>
        <div>
          <label className="label" htmlFor="f-spot">{t("spot")}</label>
          <select className="input" id="f-spot" name="spot" defaultValue={sp.spot ?? ""}><option value="">{t("all")}</option>{spots.map((s) => <option key={s.id} value={s.id}>{s.planNumber}</option>)}</select>
        </div>
        <div>
          <label className="label" htmlFor="f-user">{t("resident")}</label>
          <select className="input" id="f-user" name="user" defaultValue={sp.user ?? ""}><option value="">{t("all")}</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        </div>
        <div>
          <label className="label" htmlFor="f-status">{t("status")}</label>
          <select className="input" id="f-status" name="status" defaultValue={sp.status ?? ""}><option value="">{t("all")}</option>{BOOKING_STATUSES.map((s) => <option key={s} value={s}>{tb(s)}</option>)}</select>
        </div>
        <div>
          <label className="label" htmlFor="f-pay">{t("payment")}</label>
          <select className="input" id="f-pay" name="payment" defaultValue={sp.payment ?? ""}><option value="">{t("all")}</option>{PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{tp(s)}</option>)}</select>
        </div>
        <div className="flex flex-wrap gap-2 sm:col-span-3 lg:col-span-6">
          <button className="btn-primary btn-small">{t("filter")}</button>
          <Link href="/admin/bookings" className="btn-secondary btn-small">{t("reset")}</Link>
          <a href={`/api/admin/bookings?${qs}`} className="btn-secondary btn-small">{t("csvExport")}</a>
        </div>
      </form>
      <div className="card overflow-x-auto p-0 sm:p-0">
        <table className="table">
          <thead><tr><th>{t("spot")}</th><th>{t("period")}</th><th>{t("tenant")}</th><th>{t("owner")}</th><th>{t("status")}</th><th>{t("price")}</th></tr></thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={6} className="text-slate-500">{t("noResults")}</td></tr> : null}
            {rows.map((b) => (
              <tr key={b.id}>
                <td><Link className="text-brand-700 underline" href={`/bookings/${b.id}`}>{b.spot.planNumber}</Link></td>
                <td className="whitespace-nowrap text-xs">{formatDateTime(b.startsAt, locale)}<br />{formatDateTime(b.endsAt, locale)}</td>
                <td>{b.tenant.name}</td>
                <td>{names.get(b.ownerId)}</td>
                <td className="text-xs">{tb(b.status)}<br />{tp(b.paymentStatus)}</td>
                <td>{formatEuro(b.priceCents, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
