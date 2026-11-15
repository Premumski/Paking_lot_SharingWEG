import { prisma } from "@/lib/db";
import { apiUser } from "@/lib/api";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return new Response("unauthorized", { status: 401 });
  const { id } = await params;
  const photo = await prisma.problemPhoto.findUnique({ where: { id }, include: { report: { include: { booking: true } } } });
  const b = photo?.report.booking;
  if (!photo || !b || (b.tenantId !== user.id && b.ownerId !== user.id && user.role !== "ADMIN")) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(photo.data), {
    headers: { "Content-Type": photo.mime, "Cache-Control": "private, max-age=3600", "Content-Security-Policy": "default-src 'none'", "X-Content-Type-Options": "nosniff" },
  });
}
