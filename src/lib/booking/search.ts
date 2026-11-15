import type { User } from "@prisma/client";
import { prisma } from "../db";
import { isCoveredBy, overlapsAny } from "../domain/availability";
import { calculatePriceCents } from "../domain/pricing";
import { MINUTE, ceilToSlot, localDateString, localTimeString, parseLocal, HOUR } from "../domain/time";
import { now } from "../clock";
import { loadAvailability, loadBusy } from "./availability";

export interface SpotState {
  id: string;
  planNumber: string;
  label: string;
  type: string;
  state: "free" | "busy";
  own: boolean;
  priceCents: number;
  pricePerHourCents: number;
  pricePerDayCents: number;
  description: string;
  instant: boolean;
}

export interface Period {
  fromDate: string;
  fromTime: string;
  toDate: string;
  toTime: string;
  start: Date;
  end: Date;
  valid: boolean;
}

/** Reads the search period from query params; default: next slot for 2 hours. */
export function parsePeriod(sp: Record<string, string | undefined>): Period {
  const start = sp.fromDate && sp.fromTime ? parseLocal(sp.fromDate, sp.fromTime) : null;
  const end = sp.toDate && sp.toTime ? parseLocal(sp.toDate, sp.toTime) : null;
  if (start && end) {
    return {
      fromDate: sp.fromDate!, fromTime: sp.fromTime!, toDate: sp.toDate!, toTime: sp.toTime!,
      start, end, valid: end > start,
    };
  }
  const s = ceilToSlot(now());
  const e = new Date(s.getTime() + 2 * HOUR);
  return {
    fromDate: localDateString(s), fromTime: localTimeString(s), toDate: localDateString(e), toTime: localTimeString(e),
    start: s, end: e, valid: true,
  };
}

/** K-02: state of every spot for the chosen period. */
export async function searchSpots(user: User, start: Date, end: Date): Promise<SpotState[]> {
  const spots = await prisma.parkingSpot.findMany({ orderBy: { planNumber: "asc" }, include: { owner: true } });
  const range = { start: start.getTime() - 1, end: end.getTime() + 1 };
  const req = { start: start.getTime(), end: end.getTime() };
  const valid = end > start;
  const [avail, busy] = await Promise.all([loadAvailability(spots, range), loadBusy(spots.map((s) => s.id), range)]);
  return spots.map((s) => {
    const bookable =
      valid &&
      s.owner?.status === "ACTIVE" &&
      s.ownerId !== user.id &&
      isCoveredBy(avail.get(s.id) ?? [], req) &&
      !overlapsAny(busy.get(s.id) ?? [], req);
    const priceCents = calculatePriceCents(end.getTime() - start.getTime(), s.pricePerHourCents, s.pricePerDayCents);
    const paidButNoAccount = priceCents > 0 && !s.owner?.paymentOnboarded;
    return {
      id: s.id,
      planNumber: s.planNumber,
      label: s.label,
      type: s.type,
      state: bookable && !paidButNoAccount ? "free" : "busy",
      own: s.ownerId === user.id,
      priceCents,
      pricePerHourCents: s.pricePerHourCents,
      pricePerDayCents: s.pricePerDayCents,
      description: s.description,
      instant: s.instantBooking && end.getTime() - start.getTime() <= s.instantMaxMinutes * MINUTE,
    };
  });
}
