import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiUser } from "@/lib/api";

const Sub = z.object({ endpoint: z.string().url().max(1000), keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }) });

export async function POST(req: Request) {
  const user = await apiUser();
  if (!user) return new Response("unauthorized", { status: 401 });
  const parsed = Sub.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !parsed.data.endpoint.startsWith("https://")) return new Response("bad request", { status: 400 });
  const { endpoint, keys } = parsed.data;
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { endpoint, p256dh: keys.p256dh, auth: keys.auth, userId: user.id },
    update: { p256dh: keys.p256dh, auth: keys.auth, userId: user.id },
  });
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await apiUser();
  if (!user) return new Response("unauthorized", { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { endpoint?: string };
  if (body.endpoint) await prisma.pushSubscription.deleteMany({ where: { endpoint: body.endpoint, userId: user.id } });
  return Response.json({ ok: true });
}
