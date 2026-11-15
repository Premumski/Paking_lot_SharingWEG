import type { Booking, CancelledBy, ParkingSpot, User } from "@prisma/client";
import { prisma } from "../db";
import { now } from "../clock";
import { audit } from "../audit";
import { AppError, isOverlapViolation } from "../errors";
import { getSettings } from "../settings";
import { notify } from "../notify";
import { issueToken } from "../tokens";
import { paymentAdapter } from "../payments";
import { activeTemplate, createContracts } from "../contracts";
import { formatEuro } from "../domain/pricing";
import { HOUR, MINUTE, localDateString, localTimeString } from "../domain/time";
import { formatDateTime } from "@/i18n/server";
import { env } from "../env";
import { isCoveredBy, overlapsAny } from "../domain/availability";
import { loadAvailability, loadBusy } from "./availability";
import { quoteBooking } from "./quote";

type FullBooking = Booking & { spot: ParkingSpot; tenant: User };

async function loadBooking(id: string): Promise<FullBooking> {
  const b = await prisma.booking.findUnique({ where: { id }, include: { spot: true, tenant: true } });
  if (!b) throw new AppError("notFound");
  return b;
}

function bookingVars(b: FullBooking, extra: Record<string, string | number> = {}) {
  return (locale: string) => ({
    spot: b.spot.planNumber,
    label: b.spot.label,
    start: formatDateTime(b.startsAt, locale),
    end: formatDateTime(b.endsAt, locale),
    price: formatEuro(b.priceCents, locale),
    tenant: b.tenant.name,
    ...extra,
  });
}

/** Map link with the same period, used as hint to other free spots (B-04). */
function searchPath(b: Booking) {
  const q = new URLSearchParams({
    fromDate: localDateString(b.startsAt),
    fromTime: localTimeString(b.startsAt),
    toDate: localDateString(b.endsAt),
    toTime: localTimeString(b.endsAt),
  });
  return `${env.appUrl}/?${q.toString()}`;
}

export async function countFreeSpots(start: Date, end: Date, excludeSpotId?: string) {
  const spots = await prisma.parkingSpot.findMany({
    where: { ownerId: { not: null }, paused: false, ...(excludeSpotId ? { id: { not: excludeSpotId } } : {}) },
  });
  const range = { start: start.getTime() - 1, end: end.getTime() + 1 };
  const req = { start: start.getTime(), end: end.getTime() };
  const [avail, busy] = await Promise.all([loadAvailability(spots, range), loadBusy(spots.map((s) => s.id), range)]);
  return spots.filter((s) => isCoveredBy(avail.get(s.id)!, req) && !overlapsAny(busy.get(s.id)!, req)).length;
}

export interface RequestInput {
  spotId: string;
  start: Date;
  end: Date;
  visitorName?: string;
  licensePlate?: string;
  acceptContract: boolean;
  extendsBookingId?: string | null;
}

/** B-01: creates a request. Returns a redirect URL to the hosted payment page if a payment method is needed. */
export async function createRequest(tenant: User, input: RequestInput): Promise<{ bookingId: string; redirect?: string; confirmed: boolean }> {
  const { quote, spot } = await quoteBooking({ tenant, ...input });
  if (!quote.ok || !spot) throw new AppError(`booking.${quote.error}`);
  // V-03: explicit, not pre-selected contract confirmation is required.
  if (!input.acceptContract) throw new AppError("booking.contractRequired");
  const tpl = await activeTemplate();
  if (!tpl) throw new AppError("booking.noContractTemplate");

  let visitorName = input.visitorName?.trim().slice(0, 80) || null;
  let licensePlate = input.licensePlate?.trim().toUpperCase().slice(0, 15) || null;
  if (input.extendsBookingId) {
    const base = await prisma.booking.findUnique({ where: { id: input.extendsBookingId } });
    visitorName = visitorName ?? base?.visitorName ?? null;
    licensePlate = licensePlate ?? base?.licensePlate ?? null;
  }

  const t = now();
  const booking = await prisma.booking.create({
    data: {
      spotId: spot.id,
      tenantId: tenant.id,
      ownerId: spot.ownerId!,
      startsAt: input.start,
      endsAt: input.end,
      priceCents: quote.priceCents,
      visitorName,
      licensePlate,
      extendsBookingId: input.extendsBookingId ?? null,
      contractVersion: tpl.version,
      contractAcceptedAt: t,
      status: "DRAFT",
      createdAt: t,
    },
  });
  await audit("booking.draft", { actorId: tenant.id, entityType: "Booking", entityId: booking.id, details: { priceCents: quote.priceCents } });

  if (quote.priceCents > 0) {
    // Z-05: tenant stores a payment method on a hosted page; nothing is charged yet.
    const url = await paymentAdapter().startMethodCollection({ booking, tenant, owner: spot.owner!, locale: tenant.locale });
    return { bookingId: booking.id, redirect: url, confirmed: false };
  }
  // Z-11: free bookings skip the payment step.
  const confirmed = await submitRequest(booking.id);
  return { bookingId: booking.id, confirmed };
}

/** Called once the payment method is saved (or directly for free bookings). Returns true if instantly confirmed. */
export async function submitRequest(bookingId: string): Promise<boolean> {
  const b = await loadBooking(bookingId);
  if (b.status !== "DRAFT") return b.status === "CONFIRMED";
  const settings = await getSettings();
  const t = now();
  const { quote } = await quoteBooking({
    tenant: b.tenant,
    spotId: b.spotId,
    start: b.startsAt,
    end: b.endsAt,
    extendsBookingId: b.extendsBookingId,
    selfBookingId: b.id,
  });
  if (!quote.ok) {
    // Availability changed while the tenant was on the payment page.
    await prisma.booking.update({ where: { id: b.id }, data: { status: "DECLINED", decidedAt: t, cancelReason: quote.error } });
    await audit("booking.declined", { entityType: "Booking", entityId: b.id, details: { reason: quote.error ?? "" } });
    await notify(b.tenant, "requestDeclined", bookingVars(b, { reason: "" }), {
      path: `/bookings/${b.id}`,
      extra: (tr) => tr("freeSpotsHint", { url: searchPath(b) }),
    });
    return false;
  }
  const expiresAt = new Date(Math.min(b.startsAt.getTime(), t.getTime() + settings.requestExpiryHours * HOUR));
  await prisma.booking.update({
    where: { id: b.id },
    data: { status: "REQUESTED", requestedAt: t, expiresAt, instant: quote.instant },
  });
  await audit("booking.requested", { actorId: b.tenantId, entityType: "Booking", entityId: b.id, details: { instant: quote.instant } });

  if (quote.instant) {
    // B-02: instant confirmation.
    try {
      await confirmBooking(b.id, null);
      return true;
    } catch (e) {
      if (!(e instanceof AppError)) throw e;
      // fall through to a normal request
    }
  }
  await notifyOwnerAboutRequest(b.id);
  return false;
}

async function notifyOwnerAboutRequest(bookingId: string) {
  const b = await loadBooking(bookingId);
  const owner = await prisma.user.findUnique({ where: { id: b.ownerId } });
  if (!owner) return;
  const ttl = Math.max((b.expiresAt?.getTime() ?? now().getTime() + 48 * HOUR) - now().getTime(), 5 * MINUTE);
  // N-02: signed single-use links (only a hash is stored).
  const confirmToken = await issueToken(owner.id, "ACTION", ttl, { bookingId: b.id, action: "confirm" });
  const declineToken = await issueToken(owner.id, "ACTION", ttl, { bookingId: b.id, action: "decline" });
  const { estimatePayoutCents } = await import("../domain/pricing");
  await notify(owner, "requestNew", bookingVars(b, { payout: "" }), {
    path: `/bookings/${b.id}`,
    extra: (tr) =>
      [
        b.priceCents > 0 ? tr("payoutHint", { payout: formatEuro(estimatePayoutCents(b.priceCents), owner.locale) }) : "",
        `${tr("confirmLink")}: ${env.appUrl}/a/${confirmToken}`,
        `${tr("declineLink")}: ${env.appUrl}/a/${declineToken}`,
      ]
        .filter(Boolean)
        .join("\n"),
  });
}

/**
 * Confirms a request (B-02/B-03). `actorId` = owner, null = system (instant confirmation).
 * The database exclusion constraint guarantees no double booking (T-18).
 */
export async function confirmBooking(bookingId: string, actorId: string | null) {
  const b = await loadBooking(bookingId);
  if (actorId && b.spot.ownerId !== actorId) throw new AppError("forbidden"); // P-02
  if (b.status !== "REQUESTED") throw new AppError("booking.notPending");
  const t = now();
  if (b.expiresAt && b.expiresAt <= t) throw new AppError("booking.expired");

  const settings = await getSettings();
  if (settings.fairnessLimit > 0) {
    const upcoming = await prisma.booking.count({
      where: { tenantId: b.tenantId, status: "CONFIRMED", startsAt: { gt: t } },
    });
    if (upcoming >= settings.fairnessLimit) throw new AppError("booking.fairnessLimitTenant");
  }
  const range = { start: b.startsAt.getTime() - 1, end: b.endsAt.getTime() + 1 };
  const avail = await loadAvailability([b.spot], range, { ignorePause: actorId !== null });
  if (!isCoveredBy(avail.get(b.spotId)!, { start: b.startsAt.getTime(), end: b.endsAt.getTime() })) {
    throw new AppError("booking.notAvailable");
  }

  const paid = b.priceCents > 0;
  let declined: Booking[] = [];
  try {
    declined = await prisma.$transaction(async (tx) => {
      const res = await tx.booking.updateMany({
        where: { id: b.id, status: "REQUESTED" },
        data: { status: "CONFIRMED", decidedAt: t, paymentStatus: paid ? "PENDING" : "NONE" },
      });
      if (res.count !== 1) throw new AppError("booking.notPending");
      if (paid) {
        await tx.payment.create({
          data: { bookingId: b.id, provider: paymentAdapter().name, amountCents: b.priceCents, status: "PENDING", methodType: b.paymentMethodType },
        });
      }
      // B-04: overlapping open requests are declined automatically.
      const overlapping = await tx.booking.findMany({
        where: {
          spotId: b.spotId,
          id: { not: b.id },
          status: { in: ["REQUESTED", "DRAFT"] },
          startsAt: { lt: b.endsAt },
          endsAt: { gt: b.startsAt },
        },
      });
      if (overlapping.length) {
        await tx.booking.updateMany({
          where: { id: { in: overlapping.map((o) => o.id) } },
          data: { status: "DECLINED", decidedAt: t, cancelReason: "overlap" },
        });
      }
      await audit(
        "booking.confirmed",
        { actorId, entityType: "Booking", entityId: b.id, details: { instant: actorId === null, autoDeclined: overlapping.length } },
        tx,
      );
      return overlapping;
    });
  } catch (e) {
    if (isOverlapViolation(e)) throw new AppError("booking.overlap");
    throw e;
  }

  if (paid) await startCharge(b.id);

  const contracts = await createContracts(b.id).catch((e) => {
    console.error("[contract] generation failed", e);
    return {} as Record<string, Buffer>;
  });
  const owner = await prisma.user.findUniqueOrThrow({ where: { id: b.ownerId } });
  const attach = (locale: string) =>
    contracts[locale] ? [{ filename: `Mietvertrag-${b.spot.planNumber}-${b.id.slice(0, 8)}.pdf`, content: contracts[locale], contentType: "application/pdf" }] : [];
  await notify(b.tenant, "requestConfirmed", bookingVars(b), { path: `/bookings/${b.id}`, attachments: attach(b.tenant.locale) });
  await notify(owner, "requestConfirmed", bookingVars(b), {
    path: `/bookings/${b.id}`,
    attachments: attach(owner.locale),
    extra: (tr) => tr("ownerConfirmedHint", { tenant: b.tenant.name }),
  });
  for (const d of declined) {
    if (d.status === "DRAFT") continue;
    const full = await loadBooking(d.id);
    await notify(full.tenant, "requestDeclined", bookingVars(full), {
      path: `/bookings/${d.id}`,
      extra: (tr) => tr("freeSpotsHint", { url: searchPath(d) }),
    });
  }
}

/** Charges the saved payment method (Z-05). The result arrives via webhook. */
export async function startCharge(bookingId: string) {
  const b = await loadBooking(bookingId);
  const payment = await prisma.payment.findFirst({ where: { bookingId, status: "PENDING" }, orderBy: { createdAt: "desc" } });
  if (!payment) return;
  const owner = await prisma.user.findUniqueOrThrow({ where: { id: b.ownerId } });
  try {
    const { providerRef } = await paymentAdapter().charge({ booking: b, payment, owner, tenant: b.tenant });
    if (providerRef) await prisma.payment.update({ where: { id: payment.id }, data: { providerRef } });
  } catch (e) {
    console.error("[payment] charge failed to start", (e as Error).message);
  }
}

/** B-03: owner declines without reason. */
export async function declineBooking(bookingId: string, ownerId: string) {
  const b = await loadBooking(bookingId);
  if (b.spot.ownerId !== ownerId) throw new AppError("forbidden");
  const res = await prisma.booking.updateMany({
    where: { id: b.id, status: "REQUESTED" },
    data: { status: "DECLINED", decidedAt: now() },
  });
  if (res.count !== 1) throw new AppError("booking.notPending");
  await audit("booking.declined", { actorId: ownerId, entityType: "Booking", entityId: b.id });
  await notify(b.tenant, "requestDeclined", bookingVars(b), {
    path: `/bookings/${b.id}`,
    extra: (tr) => tr("freeSpotsHint", { url: searchPath(b) }),
  });
}

/** B-05: tenant withdraws before confirmation, without cost. */
export async function withdrawBooking(bookingId: string, tenantId: string) {
  const b = await loadBooking(bookingId);
  if (b.tenantId !== tenantId) throw new AppError("forbidden");
  const res = await prisma.booking.updateMany({
    where: { id: b.id, status: { in: ["REQUESTED", "DRAFT"] } },
    data: { status: "WITHDRAWN", decidedAt: now() },
  });
  if (res.count !== 1) throw new AppError("booking.notPending");
  await audit("booking.withdrawn", { actorId: tenantId, entityType: "Booking", entityId: b.id });
}

/**
 * B-06 / B-07 / Z-06: cancellation before start. Every cancellation triggers a full refund (Z-08).
 */
export async function cancelBooking(
  bookingId: string,
  actor: { userId: string | null; as: CancelledBy },
  reason?: string,
) {
  const b = await loadBooking(bookingId);
  const t = now();
  if (actor.as === "TENANT" && b.tenantId !== actor.userId) throw new AppError("forbidden");
  if (actor.as === "OWNER" && b.spot.ownerId !== actor.userId) throw new AppError("forbidden");
  if (b.status !== "CONFIRMED") throw new AppError("booking.notConfirmed");
  if (actor.as !== "SYSTEM" && b.startsAt <= t) throw new AppError("booking.alreadyStarted");
  const cleanReason = reason?.trim().slice(0, 300) ?? "";
  if (actor.as === "OWNER" && cleanReason.length < 3) throw new AppError("booking.reasonRequired");

  const res = await prisma.booking.updateMany({
    where: { id: b.id, status: "CONFIRMED" },
    data: { status: "CANCELLED", cancelledBy: actor.as, cancelReason: cleanReason || null, cancelledAt: t },
  });
  if (res.count !== 1) throw new AppError("booking.notConfirmed");
  await audit("booking.cancelled", { actorId: actor.userId, entityType: "Booking", entityId: b.id, details: { by: actor.as } });

  await refundBooking(b.id);

  const owner = await prisma.user.findUniqueOrThrow({ where: { id: b.ownerId } });
  const vars = bookingVars(b, { reason: cleanReason || "–" });
  const refundLine = (tr: (k: string, v?: Record<string, string | number>) => string) =>
    b.priceCents > 0 ? tr("refundHint", { price: formatEuro(b.priceCents, b.tenant.locale) }) : "";
  if (actor.as === "OWNER") {
    await notify(b.tenant, "bookingCancelled", vars, {
      path: `/bookings/${b.id}`,
      extra: (tr) => [tr("cancelledByOwner", { reason: cleanReason }), refundLine(tr), tr("freeSpotsHint", { url: searchPath(b) })].filter(Boolean).join("\n"),
    });
  } else if (actor.as === "TENANT") {
    await notify(owner, "bookingCancelled", vars, { path: `/bookings/${b.id}`, extra: (tr) => tr("cancelledByTenant") });
  } else {
    await notify(b.tenant, "bookingCancelled", vars, { path: `/bookings/${b.id}`, extra: (tr) => tr("cancelledBySystem") });
    await notify(owner, "bookingCancelled", vars, { path: `/bookings/${b.id}`, extra: (tr) => tr("cancelledBySystem") });
  }
}

/** Z-08: refunds everything that was (or is being) paid. */
export async function refundBooking(bookingId: string) {
  const b = await loadBooking(bookingId);
  const owner = await prisma.user.findUniqueOrThrow({ where: { id: b.ownerId } });
  const payments = await prisma.payment.findMany({ where: { bookingId, status: { in: ["PAID", "PROCESSING"] } } });
  for (const p of payments) {
    try {
      await paymentAdapter().refund({ payment: p, owner });
      await prisma.payment.update({ where: { id: p.id }, data: { status: "REFUND_PENDING" } });
      await prisma.booking.update({ where: { id: bookingId }, data: { paymentStatus: "REFUND_PENDING" } });
      await audit("payment.refundRequested", { entityType: "Payment", entityId: p.id });
    } catch (e) {
      console.error("[payment] refund failed", (e as Error).message);
      await audit("payment.refundFailed", { entityType: "Payment", entityId: p.id });
    }
  }
  // A charge that is still pending is refunded when its success webhook arrives.
}

/** Z-06: tenant pays again after a failed charge. */
export async function startPaymentRetry(bookingId: string, tenantId: string): Promise<string> {
  const b = await loadBooking(bookingId);
  if (b.tenantId !== tenantId) throw new AppError("forbidden");
  if (b.status !== "CONFIRMED" || b.paymentStatus !== "FAILED") throw new AppError("payment.noRetry");
  if (b.paymentRetryUntil && b.paymentRetryUntil < now()) throw new AppError("payment.retryExpired");
  const owner = await prisma.user.findUniqueOrThrow({ where: { id: b.ownerId } });
  const payment = await prisma.payment.create({
    data: { bookingId, provider: paymentAdapter().name, amountCents: b.priceCents, status: "PENDING" },
  });
  // The booking stays FAILED until the success webhook arrives, so the 12 h deadline still applies.
  return paymentAdapter().startRetry({ booking: b, payment, owner, tenant: b.tenant, locale: b.tenant.locale });
}
