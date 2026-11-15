import type { AvailabilityRule, Blocking, ParkingSpot } from "@prisma/client";
import { prisma } from "../db";
import { computeAvailability, type Interval, type RuleInput } from "../domain/availability";

export function toRuleInput(r: AvailabilityRule): RuleInput {
  switch (r.kind) {
    case "MANUAL":
      return { kind: "MANUAL", startsAt: r.startsAt, endsAt: r.endsAt };
    case "WEEKLY":
      return {
        kind: "WEEKLY",
        startsAt: r.startsAt,
        weekdays: r.weekdays,
        startMin: r.startMin ?? 0,
        endMin: r.endMin ?? 0,
        validUntil: r.validUntil,
      };
    case "WEEKENDS":
      return { kind: "WEEKENDS", startsAt: r.startsAt, validUntil: r.validUntil };
    case "ALWAYS":
      return { kind: "ALWAYS", startsAt: r.startsAt, validUntil: r.validUntil };
  }
}

export function windowsFor(rules: AvailabilityRule[], blocks: Blocking[], range: Interval): Interval[] {
  return computeAvailability(rules.map(toRuleInput), blocks, range);
}

/** Availability windows per spot within `range`. Paused spots (P-08) have none for new requests. */
export async function loadAvailability(
  spots: (ParkingSpot & { rules?: AvailabilityRule[]; blocks?: Blocking[] })[],
  range: Interval,
  opts: { ignorePause?: boolean } = {},
): Promise<Map<string, Interval[]>> {
  const ids = spots.map((s) => s.id);
  const [rules, blocks] = await Promise.all([
    prisma.availabilityRule.findMany({ where: { spotId: { in: ids } } }),
    prisma.blocking.findMany({
      where: { spotId: { in: ids }, endsAt: { gt: new Date(range.start) }, startsAt: { lt: new Date(range.end) } },
    }),
  ]);
  const map = new Map<string, Interval[]>();
  for (const s of spots) {
    if (s.paused && !opts.ignorePause) {
      map.set(s.id, []);
      continue;
    }
    map.set(
      s.id,
      windowsFor(
        rules.filter((r) => r.spotId === s.id),
        blocks.filter((b) => b.spotId === s.id),
        range,
      ),
    );
  }
  return map;
}

/** Confirmed bookings per spot within `range`. */
export async function loadBusy(spotIds: string[], range: Interval, excludeBookingId?: string) {
  const rows = await prisma.booking.findMany({
    where: {
      spotId: { in: spotIds },
      status: "CONFIRMED",
      startsAt: { lt: new Date(range.end) },
      endsAt: { gt: new Date(range.start) },
      ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
    },
    select: { spotId: true, startsAt: true, endsAt: true },
  });
  const map = new Map<string, Interval[]>();
  for (const id of spotIds) map.set(id, []);
  for (const r of rows) map.get(r.spotId)!.push({ start: r.startsAt.getTime(), end: r.endsAt.getTime() });
  return map;
}
