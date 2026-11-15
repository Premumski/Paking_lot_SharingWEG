import { prisma } from "./db";
import { now } from "./clock";

/**
 * S-03: fixed-window counters in the database (single server). When the limit is reached the key
 * is locked; with `escalate` every further lock doubles (15, 30, 60 … minutes, max 24 h).
 */
export async function lockStatus(key: string): Promise<{ locked: boolean; retryAfterMs: number }> {
  const rec = await prisma.rateLimit.findUnique({ where: { key } });
  const t = now();
  if (rec?.lockedUntil && rec.lockedUntil > t) return { locked: true, retryAfterMs: rec.lockedUntil.getTime() - t.getTime() };
  return { locked: false, retryAfterMs: 0 };
}

/** Registers one event (e.g. a failed login). Returns true if the key is now locked. */
export async function hit(key: string, limit: number, windowMs: number, opts: { escalate?: boolean } = {}): Promise<boolean> {
  const t = now();
  const rec = await prisma.rateLimit.findUnique({ where: { key } });
  const fresh = !rec || t.getTime() - rec.windowStart.getTime() > windowMs;
  const count = fresh ? 1 : rec!.count + 1;
  if (count >= limit) {
    const level = opts.escalate ? (rec?.lockLevel ?? 0) + 1 : 1;
    const lockMs = opts.escalate ? Math.min(windowMs * 2 ** (level - 1), 24 * 3600_000) : windowMs;
    await prisma.rateLimit.upsert({
      where: { key },
      create: { key, count: 0, windowStart: t, lockedUntil: new Date(t.getTime() + lockMs), lockLevel: level },
      update: { count: 0, windowStart: t, lockedUntil: new Date(t.getTime() + lockMs), lockLevel: level },
    });
    return true;
  }
  await prisma.rateLimit.upsert({
    where: { key },
    create: { key, count, windowStart: t },
    update: fresh ? { count, windowStart: t } : { count },
  });
  return false;
}

/** Counts every call (e.g. password reset requests). */
export async function consume(key: string, limit: number, windowMs: number) {
  const s = await lockStatus(key);
  if (s.locked) return { allowed: false, retryAfterMs: s.retryAfterMs };
  const t = now();
  const rec = await prisma.rateLimit.findUnique({ where: { key } });
  const fresh = !rec || t.getTime() - rec.windowStart.getTime() > windowMs;
  if (!fresh && rec!.count >= limit) return { allowed: false, retryAfterMs: windowMs - (t.getTime() - rec!.windowStart.getTime()) };
  await prisma.rateLimit.upsert({
    where: { key },
    create: { key, count: 1, windowStart: t },
    update: fresh ? { count: 1, windowStart: t, lockedUntil: null } : { count: { increment: 1 } },
  });
  return { allowed: true, retryAfterMs: 0 };
}

/** Clears the failure counter after a success but keeps the escalation level. */
export async function resetRateLimit(key: string) {
  await prisma.rateLimit.updateMany({ where: { key }, data: { count: 0 } });
}
