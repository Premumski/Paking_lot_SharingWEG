import { prisma } from "@/lib/db";
import { apiUser, noStore, toCsv } from "@/lib/api";
import { statementPdf } from "@/lib/pdf";
import { formatDate, formatDateTime, translatorFor } from "@/i18n/server";
import { formatEuro } from "@/lib/domain/pricing";
import { fromLocal } from "@/lib/domain/time";

/** Z-10: annual statement for owners (PDF, CSV). */
export async function GET(req: Request) {
  const user = await apiUser();
  if (!user) return new Response("unauthorized", { status: 401 });
  const url = new URL(req.url);
  const year = Number(url.searchParams.get("year"));
  const format = url.searchParams.get("format") === "csv" ? "csv" : "pdf";
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return new Response("bad request", { status: 400 });
  const from = fromLocal(year, 1, 1);
  const to = fromLocal(year + 1, 1, 1);
  const payments = await prisma.payment.findMany({
    where: { booking: { ownerId: user.id }, paidAt: { gte: from, lt: to } },
    include: { booking: { include: { spot: true } } },
    orderBy: { paidAt: "asc" },
  });
  const t = translatorFor(user.locale, "statement");
  const l = user.locale;
  const rows = payments.map((p) => {
    const refunded = p.status === "REFUNDED";
    const net = refunded ? -p.feeCents : p.amountCents - p.feeCents;
    return { p, refunded, net };
  });
  const sum = rows.reduce((a, r) => a + r.net, 0);
  if (format === "csv") {
    const csv = toCsv([
      [t("date"), t("bookingId"), t("spot"), t("start"), t("end"), t("amount"), t("fee"), t("payout"), t("status")],
      ...rows.map(({ p, refunded, net }) => [
        formatDate(p.paidAt!, l), p.bookingId, p.booking.spot.planNumber, formatDateTime(p.booking.startsAt, l), formatDateTime(p.booking.endsAt, l),
        (p.amountCents / 100).toFixed(2), (p.feeCents / 100).toFixed(2), (net / 100).toFixed(2), refunded ? t("refunded") : t("paid"),
      ]),
    ]);
    return new Response(csv, { headers: { ...noStore, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="Jahresauszug-${year}.csv"` } });
  }
  const pdf = await statementPdf({
    title: t("title", { year }),
    subtitle: `${user.name} · ${user.apartment}`,
    headers: { date: t("date"), spot: t("spot"), period: t("period"), amount: t("amount"), fee: t("fee"), payout: t("payout"), status: t("status") },
    rows: rows.map(({ p, refunded, net }) => ({
      date: formatDate(p.paidAt!, l),
      spot: p.booking.spot.planNumber,
      period: `${formatDateTime(p.booking.startsAt, l)} – ${formatDateTime(p.booking.endsAt, l)}`,
      amount: formatEuro(p.amountCents, l),
      fee: formatEuro(p.feeCents, l),
      payout: formatEuro(net, l),
      status: refunded ? t("refunded") : t("paid"),
    })),
    totals: t("total", { sum: formatEuro(sum, l) }),
    footer: t("footer"),
  });
  return new Response(new Uint8Array(pdf), { headers: { ...noStore, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="Jahresauszug-${year}.pdf"` } });
}
