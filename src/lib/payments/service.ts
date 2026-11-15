import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { now } from "../clock";
import { audit } from "../audit";
import { notify, notifyAdmins } from "../notify";
import { formatEuro, estimateFeeCents } from "../domain/pricing";
import { HOUR } from "../domain/time";
import { formatDateTime } from "@/i18n/server";
import { adapterByName, paymentAdapter } from "./index";
import type { PaymentEvent } from "./types";

/**
 * Z-09: the only place where payment states change. Called by the webhook routes after the
 * signature has been verified. Every event id is processed at most once (idempotent).
 */
export async function handleWebhook(provider: "mock" | "stripe", rawBody: string, headers: Headers) {
  const event = await adapterByName(provider).parseWebhook(rawBody, headers);
  if (!event) return { handled: false };
  try {
    await prisma.webhookEvent.create({ data: { id: event.id, provider, type: event.type } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { handled: true, duplicate: true };
    throw e;
  }
  await applyEvent(event);
  return { handled: true };
}

async function findPayment(ev: { paymentId?: string; providerRef?: string }) {
  if (ev.paymentId) {
    const p = await prisma.payment.findUnique({ where: { id: ev.paymentId } });
    if (p) return p;
  }
  if (ev.providerRef) return prisma.payment.findUnique({ where: { providerRef: ev.providerRef } });
  return null;
}

async function applyEvent(ev: PaymentEvent) {
  switch (ev.type) {
    case "account_updated": {
      const user = await prisma.user.findFirst({ where: { paymentAccountId: ev.accountRef } });
      if (!user) return;
      await prisma.user.update({ where: { id: user.id }, data: { paymentOnboarded: ev.chargesEnabled } });
      await audit("payment.accountUpdated", { entityType: "User", entityId: user.id, details: { chargesEnabled: ev.chargesEnabled } });
      return;
    }
    case "method_saved": {
      const booking = await prisma.booking.findUnique({ where: { id: ev.bookingId } });
      if (!booking) return;
      await prisma.booking.update({
        where: { id: booking.id },
        data: { paymentMethodRef: ev.paymentMethodRef, paymentMethodType: ev.methodType, paymentStatus: booking.status === "DRAFT" ? "METHOD_SAVED" : booking.paymentStatus },
      });
      await audit("payment.methodSaved", { entityType: "Booking", entityId: booking.id, details: { methodType: ev.methodType } });
      if (booking.status === "DRAFT") {
        const { submitRequest } = await import("../booking/service");
        await submitRequest(booking.id);
      }
      return;
    }
    case "payment_processing": {
      const p = await findPayment(ev);
      if (!p) return;
      await prisma.payment.update({ where: { id: p.id }, data: { status: "PROCESSING", providerRef: p.providerRef ?? ev.providerRef, methodType: "sepa_debit" } });
      await prisma.booking.update({ where: { id: p.bookingId }, data: { paymentStatus: "PROCESSING" } });
      await audit("payment.processing", { entityType: "Payment", entityId: p.id });
      return;
    }
    case "payment_succeeded": {
      const p = await findPayment(ev);
      if (!p) return;
      const method = (ev.methodType ?? p.methodType ?? "card") === "sepa_debit" ? "sepa_debit" : "card";
      await prisma.payment.update({
        where: { id: p.id },
        data: { status: "PAID", paidAt: now(), providerRef: p.providerRef ?? ev.providerRef, methodType: method, feeCents: estimateFeeCents(p.amountCents, method) },
      });
      const b = await prisma.booking.update({
        where: { id: p.bookingId },
        data: { paymentStatus: "PAID", paymentRetryUntil: null },
      });
      await audit("payment.succeeded", { entityType: "Payment", entityId: p.id });
      if (b.status === "CANCELLED") {
        // Paid after cancellation (race): refund right away (Z-08).
        const { refundBooking } = await import("../booking/service");
        await refundBooking(b.id);
      }
      return;
    }
    case "payment_failed": {
      const p = await findPayment(ev);
      if (!p) return;
      const wasProcessing = p.status === "PROCESSING" || p.status === "PAID";
      await prisma.payment.update({ where: { id: p.id }, data: { status: "FAILED", failureCode: ev.failureCode ?? null, providerRef: p.providerRef ?? ev.providerRef } });
      const booking = await prisma.booking.findUniqueOrThrow({ where: { id: p.bookingId }, include: { spot: true, tenant: true } });
      if (booking.status !== "CONFIRMED") return;
      // Z-06: 12 h to pay again, otherwise automatic cancellation.
      const retryUntil = new Date(now().getTime() + 12 * HOUR);
      await prisma.booking.update({ where: { id: booking.id }, data: { paymentStatus: "FAILED", paymentRetryUntil: retryUntil } });
      await audit("payment.failed", { entityType: "Payment", entityId: p.id, details: { code: ev.failureCode ?? "" , bounced: wasProcessing } });
      const vars = (locale: string) => ({
        spot: booking.spot.planNumber,
        start: formatDateTime(booking.startsAt, locale),
        end: formatDateTime(booking.endsAt, locale),
        price: formatEuro(booking.priceCents, locale),
        deadline: formatDateTime(retryUntil, locale),
        tenant: booking.tenant.name,
      });
      const path = `/bookings/${booking.id}`;
      await notify(booking.tenant, "paymentProblem", vars, { path, extra: (t) => t("paymentRetryHint", vars(booking.tenant.locale)) });
      if (wasProcessing) {
        // Z-07: bounced direct debit -> tenant, owner and admin are informed.
        await notify(booking.ownerId, "paymentProblem", vars, { path, extra: (t) => t("paymentBouncedOwner") });
        await notifyAdmins("paymentProblem", vars, { path: `/admin/bookings?q=${booking.id}`, extra: (t) => t("paymentBouncedAdmin", { tenant: booking.tenant.name }) }, [booking.ownerId, booking.tenantId]);
      }
      return;
    }
    case "refund_succeeded": {
      const p = await findPayment(ev);
      if (!p) return;
      await prisma.payment.update({ where: { id: p.id }, data: { status: "REFUNDED", refundedAt: now() } });
      await prisma.booking.update({ where: { id: p.bookingId }, data: { paymentStatus: "REFUNDED" } });
      await audit("payment.refunded", { entityType: "Payment", entityId: p.id });
      return;
    }
  }
}

export { paymentAdapter };
