import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** O-07: health check for uptime monitoring. */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok", time: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "error" }, { status: 503 });
  }
}
