import webpush from "web-push";
import { prisma } from "./db";

let configured: boolean | null = null;

export function pushPublicKey() {
  return process.env.VAPID_PUBLIC_KEY ?? "";
}

function configure() {
  if (configured !== null) return configured;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return (configured = false);
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@localhost", pub, priv);
  return (configured = true);
}

export async function sendPush(userId: string, payload: { title: string; body: string; url: string }) {
  if (!configure()) return;
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), {
          TTL: 3600,
        });
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
      }
    }),
  );
}
