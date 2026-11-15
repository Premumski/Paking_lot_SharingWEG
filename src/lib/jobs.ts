import { prisma } from "./db";
import { now, setClockOffset } from "./clock";
import { audit } from "./audit";
import { notify } from "./notify";
import { formatDateTime } from "@/i18n/server";
import { formatEuro } from "./domain/pricing";
import { DAY, HOUR, MINUTE } from "./domain/time";
import { cancelBooking } from "./booking/service";

const g = globalThis as unknown as { __jobsStarted?: boolean; __jobsRunning?: boolean };

/** T-10: unanswered requests expire at start or X hours after receipt, whichever is earlier. */
export async function expireRequests() {
  const t = now();
  const due = await prisma.booking.findMany({
    where: { status: "REQUESTED", expiresAt: { lte: t } },
    include: { spot: true, tenant: true },
  });
  for (const b of due) {
    const res = await prisma.booking.updateMany({ where: { id: b.id, status: "REQUESTED" }, data: { status: "EXPIRED", decidedAt: t } });
    if (res.count !== 1) continue;
    await audit("booking.expired", { entityType: "Booking", entityId: b.id });
    await notify(b.tenant, "requestExpired", (l) => ({ spot: b.spot.planNumber, start: formatDateTime(b.startsAt, l), end: formatDateTime(b.endsAt, l) }), {
      path: `/bookings/${b.id}`,
    });
  }
  // Abandoned drafts (payment page left without saving a method)
  await prisma.booking.updateMany({
    where: { status: "DRAFT", createdAt: { lt: new Date(t.getTime() - HOUR) } },
    data: { status: "WITHDRAWN", decidedAt: t },
  });
  return due.length;
}

/** Z-06: failed charge not fixed within 12 h -> automatic cancellation, spot becomes free. */
export async function cancelUnpaid() {
  const t = now();
  const due = await prisma.booking.findMany({
    where: { status: "CONFIRMED", paymentStatus: "FAILED", paymentRetryUntil: { lte: t } },
  });
  for (const b of due) await cancelBooking(b.id, { userId: null, as: "SYSTEM" }, "payment");
  return due.length;
}

/** N-01: start in 1 h, end in 30 min. */
export async function sendReminders() {
  const t = now();
  const starting = await prisma.booking.findMany({
    where: { status: "CONFIRMED", reminderStartSent: false, startsAt: { gt: t, lte: new Date(t.getTime() + HOUR) } },
    include: { spot: true },
  });
  for (const b of starting) {
    await prisma.booking.update({ where: { id: b.id }, data: { reminderStartSent: true } });
    await notify(b.tenantId, "startsSoon", (l) => ({ spot: b.spot.planNumber, start: formatDateTime(b.startsAt, l), end: formatDateTime(b.endsAt, l) }), {
      path: `/bookings/${b.id}`,
    });
  }
  const ending = await prisma.booking.findMany({
    where: { status: "CONFIRMED", reminderEndSent: false, endsAt: { gt: t, lte: new Date(t.getTime() + 30 * MINUTE) } },
    include: { spot: true },
  });
  for (const b of ending) {
    await prisma.booking.update({ where: { id: b.id }, data: { reminderEndSent: true } });
    await notify(b.tenantId, "endsSoon", (l) => ({ spot: b.spot.planNumber, end: formatDateTime(b.endsAt, l), price: formatEuro(b.priceCents, l) }), {
      path: `/bookings/${b.id}`,
    });
  }
  return starting.length + ending.length;
}

/** Retention: sessions, tokens, rate limits; audit log after 2 years (A-08). */
export async function cleanup() {
  const t = now();
  await prisma.session.deleteMany({ where: { expiresAt: { lt: t } } });
  await prisma.token.deleteMany({ where: { expiresAt: { lt: new Date(t.getTime() - 7 * DAY) } } });
  await prisma.rateLimit.deleteMany({ where: { windowStart: { lt: new Date(t.getTime() - DAY) }, OR: [{ lockedUntil: null }, { lockedUntil: { lt: t } }] } });
  await prisma.devMail.deleteMany({ where: { createdAt: { lt: new Date(t.getTime() - 14 * DAY) } } });
  await prisma.webhookEvent.deleteMany({ where: { receivedAt: { lt: new Date(t.getTime() - 90 * DAY) } } });
  await prisma.$executeRaw`DELETE FROM "AuditLog" WHERE "at" < now() - interval '2 years'`;
}

export async function runAllJobs() {
  if (g.__jobsRunning) return;
  g.__jobsRunning = true;
  try {
    await syncClock();
    await expireRequests();
    await cancelUnpaid();
    await sendReminders();
  } catch (e) {
    console.error("[jobs]", e);
  } finally {
    g.__jobsRunning = false;
  }
}

export async function syncClock() {
  if (process.env.DEV_TOOLS !== "true") return;
  const s = await prisma.settings.findUnique({ where: { id: 1 } });
  setClockOffset(Number(s?.devClockOffsetMs ?? 0));
}

export function startJobs() {
  if (g.__jobsStarted || process.env.DISABLE_JOBS === "true") return;
  g.__jobsStarted = true;
  syncClock().catch(() => {});
  setInterval(() => void runAllJobs(), 60_000);
  setInterval(() => void cleanup().catch((e) => console.error("[cleanup]", e)), 6 * 3600_000);
  setTimeout(() => void runAllJobs(), 5_000);
}
