import { prisma } from "@/lib/db";
import { apiUser, noStore } from "@/lib/api";
import { audit } from "@/lib/audit";

/** S-08: personal data export (GDPR Art. 15/20). */
export async function GET() {
  const user = await apiUser();
  if (!user) return new Response("unauthorized", { status: 401 });
  const [spots, asTenant, asOwner, sessions, reports, audits] = await Promise.all([
    prisma.parkingSpot.findMany({ where: { ownerId: user.id }, include: { rules: true, blocks: true } }),
    prisma.booking.findMany({ where: { tenantId: user.id }, include: { payments: { select: { amountCents: true, status: true, paidAt: true, refundedAt: true, methodType: true } } } }),
    prisma.booking.findMany({ where: { ownerId: user.id }, select: { id: true, spotId: true, startsAt: true, endsAt: true, status: true, priceCents: true, createdAt: true } }),
    prisma.session.findMany({ where: { userId: user.id }, select: { createdAt: true, lastSeenAt: true, userAgent: true } }),
    prisma.problemReport.findMany({ where: { reporterId: user.id }, select: { id: true, bookingId: true, category: true, text: true, createdAt: true } }),
    prisma.auditLog.findMany({ where: { actorId: user.id }, orderBy: { at: "desc" }, take: 1000 }),
  ]);
  const data = {
    exportedAt: new Date().toISOString(),
    profile: {
      id: user.id, email: user.email, name: user.name, phone: user.phone, apartment: user.apartment, role: user.role,
      locale: user.locale, totpEnabled: user.totpEnabled, notificationPrefs: user.notificationPrefs, createdAt: user.createdAt,
      paymentOnboarded: user.paymentOnboarded,
    },
    spots, bookingsAsTenant: asTenant, bookingsAsOwner: asOwner, sessions, problemReports: reports, auditLog: audits,
  };
  await audit("user.dataExported", { actorId: user.id, entityType: "User", entityId: user.id });
  return new Response(JSON.stringify(data, null, 2), {
    headers: { ...noStore, "Content-Type": "application/json", "Content-Disposition": `attachment; filename="datenexport.json"` },
  });
}
