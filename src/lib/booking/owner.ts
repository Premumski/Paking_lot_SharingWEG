import type { AvailabilityRule, Blocking, Booking } from "@prisma/client";
import { prisma } from "../db";
import { now } from "../clock";
import { AppError } from "../errors";
import { isCoveredBy } from "../domain/availability";
import { windowsFor } from "./availability";
import { cancelBooking } from "./service";

/** P-02: every owner action checks ownership on the server. */
export async function requireOwnedSpot(spotId: string, userId: string) {
  const spot = await prisma.parkingSpot.findUnique({ where: { id: spotId } });
  if (!spot || spot.ownerId !== userId) throw new AppError("forbidden");
  return spot;
}

/** Confirmed bookings (not yet ended) that would no longer be covered after the change. */
export async function findConflicts(spotId: string, rules: AvailabilityRule[], blocks: Blocking[]): Promise<Booking[]> {
  const t = now();
  const bookings = await prisma.booking.findMany({
    where: { spotId, status: "CONFIRMED", endsAt: { gt: t } },
    orderBy: { startsAt: "asc" },
  });
  if (!bookings.length) return [];
  const range = {
    start: Math.min(...bookings.map((b) => b.startsAt.getTime())) - 1,
    end: Math.max(...bookings.map((b) => b.endsAt.getTime())) + 1,
  };
  const windows = windowsFor(rules, blocks, range);
  return bookings.filter((b) => !isCoveredBy(windows, { start: b.startsAt.getTime(), end: b.endsAt.getTime() }));
}

export type ChangeResult = { applied: true; cancelled: number } | { applied: false; conflicts: Booking[] };

/**
 * P-09: deleting or shortening availability that collides with confirmed bookings is only
 * possible by cancelling those bookings explicitly (owner cancellation with reason, full refund).
 * Bookings that already started cannot be cancelled, so such changes are refused.
 */
export async function changeAvailability(params: {
  ownerId: string;
  spotId: string;
  removeRuleId?: string;
  addBlock?: { startsAt: Date; endsAt: Date; note: string };
  confirmCancel: boolean;
  reason?: string;
}): Promise<ChangeResult> {
  await requireOwnedSpot(params.spotId, params.ownerId);
  const [rules, blocks] = await Promise.all([
    prisma.availabilityRule.findMany({ where: { spotId: params.spotId } }),
    prisma.blocking.findMany({ where: { spotId: params.spotId } }),
  ]);
  if (params.removeRuleId && !rules.some((r) => r.id === params.removeRuleId)) throw new AppError("notFound");
  const nextRules = rules.filter((r) => r.id !== params.removeRuleId);
  const nextBlocks = params.addBlock
    ? [...blocks, { id: "new", spotId: params.spotId, createdAt: now(), ...params.addBlock } as Blocking]
    : blocks;
  const conflicts = await findConflicts(params.spotId, nextRules, nextBlocks);
  if (conflicts.some((b) => b.startsAt <= now())) throw new AppError("spot.affectsRunningBooking");
  if (conflicts.length && !params.confirmCancel) return { applied: false, conflicts };
  for (const b of conflicts) {
    await cancelBooking(b.id, { userId: params.ownerId, as: "OWNER" }, params.reason);
  }
  return { applied: true, cancelled: conflicts.length };
}
