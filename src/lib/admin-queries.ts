import type { BookingStatus, PaymentStatus, Prisma } from "@prisma/client";
import { parseLocal } from "./domain/time";

const STATUSES: BookingStatus[] = ["DRAFT", "REQUESTED", "CONFIRMED", "DECLINED", "WITHDRAWN", "EXPIRED", "CANCELLED"];
const PAYMENTS: PaymentStatus[] = ["NONE", "METHOD_SAVED", "PENDING", "PROCESSING", "PAID", "FAILED", "REFUND_PENDING", "REFUNDED"];

/** A-06: filters by period, spot, resident and status. */
export function bookingFilter(sp: Record<string, string | undefined>): Prisma.BookingWhereInput {
  const where: Prisma.BookingWhereInput = {};
  const from = sp.from ? parseLocal(sp.from) : null;
  const to = sp.to ? parseLocal(sp.to, "24:00") : null;
  if (from) where.endsAt = { gt: from };
  if (to) where.startsAt = { lt: to };
  if (sp.spot) where.spotId = sp.spot;
  if (sp.user) where.OR = [{ tenantId: sp.user }, { ownerId: sp.user }];
  if (sp.status && STATUSES.includes(sp.status as BookingStatus)) where.status = sp.status as BookingStatus;
  if (sp.payment && PAYMENTS.includes(sp.payment as PaymentStatus)) where.paymentStatus = sp.payment as PaymentStatus;
  if (sp.q && /^[0-9a-f-]{36}$/.test(sp.q)) where.id = sp.q;
  return where;
}

export { STATUSES as BOOKING_STATUSES, PAYMENTS as PAYMENT_STATUSES };
