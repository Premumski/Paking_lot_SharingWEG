import { prisma } from "@/lib/db";
import { apiUser, noStore } from "@/lib/api";

/** V-02: contract PDF for tenant, owner or admin. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return new Response("unauthorized", { status: 401 });
  const { id } = await params;
  const b = await prisma.booking.findUnique({ where: { id }, include: { contracts: true, spot: true } });
  if (!b || (b.tenantId !== user.id && b.ownerId !== user.id && user.role !== "ADMIN")) return new Response("not found", { status: 404 });
  const c = b.contracts.find((x) => x.locale === user.locale) ?? b.contracts[0];
  if (!c) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(c.pdf), {
    headers: {
      ...noStore,
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Mietvertrag-${b.spot.planNumber}-${b.id.slice(0, 8)}.pdf"`,
      "X-Content-SHA256": c.sha256,
    },
  });
}
