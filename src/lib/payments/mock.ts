import { randomUUID } from "node:crypto";
import type { PaymentAdapter, PaymentEvent, PayoutInfo } from "./types";
import { hmac, safeEqual } from "../crypto";
import { env } from "../env";
import { prisma } from "../db";
import { now } from "../clock";
import { DAY } from "../domain/time";

/**
 * Mock provider for local testing (PAYMENT_PROVIDER=mock). It imitates Stripe's hosted pages
 * (/dev/mock-pay) and delivers HMAC-signed webhook events through the same processing path.
 * Test methods: card_ok (succeeds), card_fail (declined at charge), sepa (processing, then
 * confirm or bounce on /dev).
 */
function secret() {
  return process.env.MOCK_WEBHOOK_SECRET ?? "dev-mock-webhook-secret";
}

export function signMockEvent(event: PaymentEvent) {
  const body = JSON.stringify(event);
  const ts = Math.floor(Date.now() / 1000);
  return { body, signature: `t=${ts},v1=${hmac(`${ts}.${body}`, secret())}` };
}

export function verifyMockSignature(body: string, header: string | null): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  if (!parts.t || !parts.v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false;
  return safeEqual(parts.v1, hmac(`${parts.t}.${body}`, secret()));
}

/** Delivers an event through the webhook pipeline (signature check + idempotency). */
export async function emitMockEvent(event: PaymentEvent) {
  const { body, signature } = signMockEvent(event);
  const { handleWebhook } = await import("./service");
  const h = new Headers({ "x-mock-signature": signature });
  await handleWebhook("mock", body, h);
}

export const mockAdapter: PaymentAdapter = {
  name: "mock",
  async createOnboardingLink() {
    return `${env.appUrl}/dev/mock-pay?mode=onboarding`;
  },
  async startMethodCollection({ booking }) {
    return `${env.appUrl}/dev/mock-pay?mode=setup&booking=${booking.id}`;
  },
  async charge({ booking, payment }) {
    const ref = `pi_mock_${randomUUID()}`;
    const method = booking.paymentMethodRef ?? "card_ok";
    // Deliver asynchronously like a real webhook.
    setTimeout(() => {
      const base = { paymentId: payment.id, providerRef: ref };
      const ev: PaymentEvent =
        method === "card_fail"
          ? { id: `evt_${randomUUID()}`, type: "payment_failed", ...base, failureCode: "card_declined" }
          : method === "sepa"
            ? { id: `evt_${randomUUID()}`, type: "payment_processing", ...base }
            : { id: `evt_${randomUUID()}`, type: "payment_succeeded", ...base, methodType: "card" };
      emitMockEvent(ev).catch((e) => console.error("[mock] event failed", e));
    }, 500);
    return { providerRef: ref };
  },
  async startRetry({ booking, payment }) {
    return `${env.appUrl}/dev/mock-pay?mode=retry&booking=${booking.id}&payment=${payment.id}`;
  },
  async refund({ payment }) {
    setTimeout(() => {
      emitMockEvent({ id: `evt_${randomUUID()}`, type: "refund_succeeded", paymentId: payment.id }).catch(() => {});
    }, 500);
  },
  async parseWebhook(rawBody, headers) {
    if (!verifyMockSignature(rawBody, headers.get("x-mock-signature"))) throw new Error("invalid signature");
    return JSON.parse(rawBody) as PaymentEvent;
  },
  async listPayouts(owner): Promise<PayoutInfo[]> {
    // Simulated: each paid booking is paid out two days after its end.
    const paid = await prisma.payment.findMany({
      where: { status: "PAID", booking: { ownerId: owner.id } },
      include: { booking: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    const t = now().getTime();
    return paid.map((p) => {
      const arrival = new Date(p.booking.endsAt.getTime() + 2 * DAY);
      return {
        id: `po_mock_${p.id.slice(0, 8)}`,
        amountCents: p.amountCents - p.feeCents,
        status: arrival.getTime() <= t ? "paid" : "pending",
        arrivalDate: arrival,
      };
    });
  },
};
