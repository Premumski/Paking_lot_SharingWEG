import { prisma } from "@/lib/db";
import { apiUser, noStore, toCsv } from "@/lib/api";
import { bookingFilter } from "@/lib/admin-queries";
import { audit } from "@/lib/audit";

/** A-06: CSV export */
export async function GET(req: Request) {
  const user = await apiUser();
  if (!user || user.role !== "ADMIN") return new Response("forbidden", { status: 403 });
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const rows = await prisma.booking.findMany({
    where: bookingFilter(sp),
    include: { spot: true, tenant: true },
    orderBy: { startsAt: "asc" },
    take: 10000,
  });
  const owners = new Map((await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.ownerId) } } })).map((u) => [u.id, u]));
  const csv = toCsv([
    ["id", "spot", "start", "end", "status", "payment", "price_eur", "tenant", "tenant_apartment", "owner", "owner_apartment", "cancelled_by", "created"],
    ...rows.map((b) => [
      b.id, b.spot.planNumber, b.startsAt.toISOString(), b.endsAt.toISOString(), b.status, b.paymentStatus, (b.priceCents / 100).toFixed(2),
      b.tenant.name, b.tenant.apartment, owners.get(b.ownerId)?.name ?? "", owners.get(b.ownerId)?.apartment ?? "", b.cancelledBy ?? "", b.createdAt.toISOString(),
    ]),
  ]);
  await audit("admin.bookingsExported", { actorId: user.id, details: { count: rows.length } });
  return new Response(csv, { headers: { ...noStore, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="buchungen.csv"' } });
}
