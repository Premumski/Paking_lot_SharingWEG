import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { now } from "@/lib/clock";
import { formatDate, formatDateTime } from "@/i18n/server";
import { formatEuro } from "@/lib/domain/pricing";
import { paymentAdapter } from "@/lib/payments";
import { ActionButton } from "@/components/ActionButton";
import { PaymentBadge } from "@/components/StatusBadge";
import { startOnboardingAction } from "@/app/actions/spots";
import { toLocalParts } from "@/lib/domain/time";

export async function generateMetadata() {
  return { title: (await getTranslations("money"))("title") };
}

export default async function EarningsPage({ searchParams }: { searchParams: Promise<{ onboarding?: string }> }) {
  const { user } = await requireUser();
  const t = await getTranslations("money");
  const locale = await getLocale();
  const sp = await searchParams;
  const ownsSpots = (await prisma.parkingSpot.count({ where: { ownerId: user.id } })) > 0;
  const [income, expenses] = await Promise.all([
    prisma.booking.findMany({
      where: { ownerId: user.id, priceCents: { gt: 0 }, status: { in: ["CONFIRMED", "CANCELLED"] } },
      include: { spot: true, payments: true },
      orderBy: { startsAt: "desc" },
      take: 200,
    }),
    prisma.booking.findMany({
      where: { tenantId: user.id, priceCents: { gt: 0 }, status: { in: ["CONFIRMED", "CANCELLED"] } },
      include: { spot: true, payments: true },
      orderBy: { startsAt: "desc" },
      take: 200,
    }),
  ]);
  const payouts = ownsSpots ? await paymentAdapter().listPayouts(user).catch(() => []) : [];
  const year = toLocalParts(now()).year;
  const years = [year, year - 1, year - 2];

  return (
    <div className="space-y-6">
      <h1 className="h1">{t("title")}</h1>
      {sp.onboarding === "done" ? <p role="status" className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{t("onboardingReturned")}</p> : null}

      {ownsSpots ? (
        <section className="space-y-3" aria-labelledby="income-h">
          <h2 id="income-h" className="h2">{t("income")}</h2>
          <div className="card flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <p><strong>{t("payoutAccount")}:</strong> {user.paymentOnboarded ? t("connected") : t("notConnected")}</p>
              <p className="hint">{t("feeInfo")}</p>
            </div>
            <ActionButton action={startOnboardingAction} label={user.paymentOnboarded ? t("manageAccount") : t("connectAccount")} />
          </div>
          <div className="card overflow-x-auto p-0 sm:p-0">
            <table className="table">
              <thead><tr><th>{t("booking")}</th><th>{t("amount")}</th><th>{t("fee")}</th><th>{t("net")}</th><th>{t("status")}</th></tr></thead>
              <tbody>
                {income.length === 0 ? <tr><td colSpan={5} className="text-slate-500">{t("none")}</td></tr> : null}
                {income.map((b) => {
                  const paid = b.payments.find((p) => p.status === "PAID" || p.status === "REFUNDED" || p.status === "REFUND_PENDING");
                  const fee = paid?.feeCents ?? 0;
                  return (
                    <tr key={b.id}>
                      <td><Link className="text-brand-700 underline" href={`/bookings/${b.id}`}>{b.spot.planNumber}</Link><div className="text-xs text-slate-500">{formatDateTime(b.startsAt, locale)}</div></td>
                      <td>{formatEuro(b.priceCents, locale)}</td>
                      <td>{paid ? formatEuro(fee, locale) : "–"}</td>
                      <td>{paid && paid.status === "PAID" ? formatEuro(b.priceCents - fee, locale) : paid ? formatEuro(-fee, locale) : "–"}</td>
                      <td><PaymentBadge status={b.paymentStatus} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="card">
            <h3 className="mb-2 font-semibold">{t("payouts")}</h3>
            {payouts.length === 0 ? <p className="text-sm text-slate-500">{t("noPayouts")}</p> : (
              <ul className="space-y-1 text-sm">
                {payouts.map((p) => (
                  <li key={p.id}>{formatEuro(p.amountCents, locale)} · {t(`payoutStatus.${p.status}`)}{p.arrivalDate ? ` · ${formatDate(p.arrivalDate, locale)}` : ""}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="card">
            <h3 className="mb-2 font-semibold">{t("statement")}</h3>
            <div className="flex flex-wrap gap-2">
              {years.map((y) => (
                <span key={y} className="flex gap-1">
                  <a className="btn-secondary btn-small" href={`/api/statement?year=${y}&format=pdf`}>{y} PDF</a>
                  <a className="btn-secondary btn-small" href={`/api/statement?year=${y}&format=csv`}>{y} CSV</a>
                </span>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="space-y-3" aria-labelledby="exp-h">
        <h2 id="exp-h" className="h2">{t("expenses")}</h2>
        <div className="card overflow-x-auto p-0 sm:p-0">
          <table className="table">
            <thead><tr><th>{t("booking")}</th><th>{t("amount")}</th><th>{t("status")}</th><th>{t("receipt")}</th></tr></thead>
            <tbody>
              {expenses.length === 0 ? <tr><td colSpan={4} className="text-slate-500">{t("none")}</td></tr> : null}
              {expenses.map((b) => (
                <tr key={b.id}>
                  <td><Link className="text-brand-700 underline" href={`/bookings/${b.id}`}>{b.spot.planNumber}</Link><div className="text-xs text-slate-500">{formatDateTime(b.startsAt, locale)}</div></td>
                  <td>{formatEuro(b.priceCents, locale)}</td>
                  <td><PaymentBadge status={b.paymentStatus} /></td>
                  <td>{["PAID", "REFUNDED", "REFUND_PENDING"].includes(b.paymentStatus) ? <a className="btn-secondary btn-small" href={`/api/receipts/${b.id}`}>PDF</a> : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
