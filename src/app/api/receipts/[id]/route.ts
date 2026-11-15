import { prisma } from "@/lib/db";
import { apiUser, noStore } from "@/lib/api";
import { markdownToPdf } from "@/lib/pdf";
import { formatDateTime, translatorFor } from "@/i18n/server";
import { formatEuro } from "@/lib/domain/pricing";

/** Z-10: receipt for tenants. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return new Response("unauthorized", { status: 401 });
  const { id } = await params;
  const b = await prisma.booking.findUnique({ where: { id }, include: { spot: true, payments: true } });
  if (!b || b.tenantId !== user.id) return new Response("not found", { status: 404 });
  const owner = await prisma.user.findUniqueOrThrow({ where: { id: b.ownerId } });
  const paid = b.payments.find((p) => p.paidAt);
  if (!paid) return new Response("not found", { status: 404 });
  const t = translatorFor(user.locale, "receipt");
  const l = user.locale;
  const md = [
    `# ${t("title")}`,
    `**${t("number")}:** ${b.id}`,
    `**${t("date")}:** ${formatDateTime(paid.paidAt!, l)}`,
    `**${t("from")}:** ${owner.name}, ${owner.apartment}`,
    `**${t("to")}:** ${user.name}, ${user.apartment}`,
    `## ${t("item")}`,
    `- ${t("spot", { spot: b.spot.planNumber, label: b.spot.label })}`,
    `- ${t("period", { start: formatDateTime(b.startsAt, l), end: formatDateTime(b.endsAt, l) })}`,
    `- **${t("amount")}: ${formatEuro(b.priceCents, l)}**`,
    paid.refundedAt ? `- ${t("refunded", { date: formatDateTime(paid.refundedAt, l) })}` : "",
    "",
    t("note"),
  ].join("\n\n");
  const pdf = await markdownToPdf(md, { title: t("title"), footer: t("footer") });
  return new Response(new Uint8Array(pdf), {
    headers: { ...noStore, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="Beleg-${b.id.slice(0, 8)}.pdf"` },
  });
}
