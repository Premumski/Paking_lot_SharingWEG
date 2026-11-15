import type { Booking, ParkingSpot, User } from "@prisma/client";
import { prisma } from "../db";
import { now } from "../clock";
import { getSettings, toHorizonSettings } from "../settings";
import { checkHorizon, type HorizonError, type Tier } from "../domain/horizon";
import { calculatePriceCents, estimatePayoutCents } from "../domain/pricing";
import { isCoveredBy, overlapsAny, type Interval } from "../domain/availability";
import { MINUTE, floorToSlot } from "../domain/time";
import { loadAvailability, loadBusy } from "./availability";

export type QuoteError =
  | "spotNotFound"
  | "ownSpot"
  | "noOwner"
  | "notAvailable"
  | "overlap"
  | "fairnessLimit"
  | "openRequestLimit"
  | "ownerNotOnboarded"
  | "extensionInvalid"
  | `horizon.${HorizonError}`;

export interface Quote {
  ok: boolean;
  error?: QuoteError;
  priceCents: number;
  payoutCents: number;
  instant: boolean;
  tier: Tier;
  latestStart: string;
  earliestStart: string;
  maxEnd: string;
}

export interface QuoteInput {
  tenant: User;
  spotId: string;
  start: Date;
  end: Date;
  extendsBookingId?: string | null;
  /** Booking id being re-validated (excluded from limit counts). */
  selfBookingId?: string;
}

/** Root of an extension chain and the sum already charged in it (B-09, T-12). */
export async function extensionChain(base: Booking) {
  let root = base;
  let paid = base.priceCents;
  const seen = new Set([base.id]);
  while (root.extendsBookingId && !seen.has(root.extendsBookingId)) {
    const prev = await prisma.booking.findUnique({ where: { id: root.extendsBookingId } });
    if (!prev) break;
    seen.add(prev.id);
    root = prev;
    paid += prev.priceCents;
  }
  return { root, paid };
}

/**
 * Validates a booking request with all rules and returns the final price (B-01, B-02, T-14, T-17).
 * The same function powers the live preview in the UI and the server-side check.
 */
export async function quoteBooking(input: QuoteInput): Promise<{ quote: Quote; spot: (ParkingSpot & { owner: User | null }) | null }> {
  const t = now();
  const settingsRow = await getSettings();
  const settings = toHorizonSettings(settingsRow);
  const spot = await prisma.parkingSpot.findUnique({ where: { id: input.spotId }, include: { owner: true } });
  const { start, end } = input;

  let totalStart = start;
  let alreadyPaid = 0;
  let isExtension = false;
  let extensionError = false;
  if (input.extendsBookingId) {
    const base = await prisma.booking.findUnique({ where: { id: input.extendsBookingId } });
    if (
      !base ||
      base.tenantId !== input.tenant.id ||
      base.spotId !== input.spotId ||
      base.status !== "CONFIRMED" ||
      base.endsAt.getTime() !== start.getTime() ||
      base.endsAt <= t
    ) {
      extensionError = true;
    } else {
      const chain = await extensionChain(base);
      if (chain.root.startsAt > t) extensionError = true; // only active bookings can be extended
      totalStart = chain.root.startsAt;
      alreadyPaid = chain.paid;
      isExtension = true;
    }
  }

  const horizon = checkHorizon({ now: t, start, end, settings, spot, totalStart, isExtension });
  const durationMs = end.getTime() - start.getTime();
  const totalMs = end.getTime() - totalStart.getTime();
  const priceCents = spot
    ? Math.max(0, calculatePriceCents(totalMs, spot.pricePerHourCents, spot.pricePerDayCents) - alreadyPaid)
    : 0;
  const base: Quote = {
    ok: false,
    priceCents,
    payoutCents: estimatePayoutCents(priceCents),
    instant: false,
    tier: horizon.tier,
    // Bookings start on the 15-minute grid, so show the latest bookable slot.
    latestStart: floorToSlot(horizon.latestStart).toISOString(),
    earliestStart: horizon.earliestStart.toISOString(),
    maxEnd: horizon.maxEnd.toISOString(),
  };
  const fail = (error: QuoteError) => ({ quote: { ...base, error }, spot });

  if (!spot) return fail("spotNotFound");
  if (extensionError) return fail("extensionInvalid");
  if (!spot.owner || spot.owner.status !== "ACTIVE") return fail("noOwner");
  if (spot.ownerId === input.tenant.id) return fail("ownSpot");
  if (!horizon.ok) return fail(`horizon.${horizon.error!}`);

  const range: Interval = { start: start.getTime() - 1, end: end.getTime() + 1 };
  const request: Interval = { start: start.getTime(), end: end.getTime() };
  const [avail, busy] = await Promise.all([loadAvailability([spot], range), loadBusy([spot.id], range)]);
  if (!isCoveredBy(avail.get(spot.id) ?? [], request)) return fail("notAvailable");
  if (overlapsAny(busy.get(spot.id) ?? [], request)) return fail("overlap");

  if (priceCents > 0 && !spot.owner.paymentOnboarded) return fail("ownerNotOnboarded");

  const exclude = input.selfBookingId ? { id: { not: input.selfBookingId } } : {};
  const [openRequests, upcomingConfirmed] = await Promise.all([
    prisma.booking.count({ where: { tenantId: input.tenant.id, status: "REQUESTED", ...exclude } }),
    prisma.booking.count({ where: { tenantId: input.tenant.id, status: "CONFIRMED", startsAt: { gt: t }, ...exclude } }),
  ]);
  if (openRequests >= settingsRow.openRequestLimit) return fail("openRequestLimit");
  if (settingsRow.fairnessLimit > 0 && upcomingConfirmed >= settingsRow.fairnessLimit) return fail("fairnessLimit");

  const instant = spot.instantBooking && durationMs <= spot.instantMaxMinutes * MINUTE;
  return { quote: { ...base, ok: true, instant }, spot };
}
