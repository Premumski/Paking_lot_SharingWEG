import Stripe from "stripe";
import type { PaymentAdapter, PaymentEvent, PayoutInfo } from "./types";
import { prisma } from "../db";
import { env } from "../env";

/**
 * Stripe Connect, "Stripe handles pricing" model (Z-01):
 *  - connected accounts with full Stripe dashboard, Stripe collects fees from the account,
 *  - direct charges on the connected account, no application fee,
 *  - card + SEPA Direct Debit via hosted Stripe Checkout (Z-04), nothing stored in the app.
 * Webhook endpoint must be a Connect endpoint ("events on connected accounts").
 */
let client: Stripe | null = null;
function stripe(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    client = new Stripe(key, { appInfo: { name: "stellplatz-sharing" } });
  }
  return client;
}

async function ensureAccount(ownerId: string, email: string): Promise<string> {
  const owner = await prisma.user.findUniqueOrThrow({ where: { id: ownerId } });
  if (owner.paymentAccountId) return owner.paymentAccountId;
  const account = await stripe().accounts.create({
    country: "DE",
    email,
    business_type: "individual",
    controller: {
      fees: { payer: "account" },
      losses: { payments: "stripe" },
      requirement_collection: "stripe",
      stripe_dashboard: { type: "full" },
    },
    capabilities: { card_payments: { requested: true }, sepa_debit_payments: { requested: true } },
    metadata: { userId: ownerId },
  });
  await prisma.user.update({ where: { id: ownerId }, data: { paymentAccountId: account.id } });
  return account.id;
}

async function ensureCustomer(tenantId: string, accountRef: string): Promise<string> {
  const existing = await prisma.paymentCustomer.findUnique({
    where: { userId_provider_accountRef: { userId: tenantId, provider: "stripe", accountRef } },
  });
  if (existing) return existing.customerRef;
  // Only the internal id is shared with Stripe; name/e-mail are entered by the tenant in Checkout.
  const customer = await stripe().customers.create({ metadata: { userId: tenantId } }, { stripeAccount: accountRef });
  await prisma.paymentCustomer.create({ data: { userId: tenantId, provider: "stripe", accountRef, customerRef: customer.id } });
  return customer.id;
}

function piRef(pi: string | Stripe.PaymentIntent | null | undefined) {
  return typeof pi === "string" ? pi : pi?.id;
}

export const stripeAdapter: PaymentAdapter = {
  name: "stripe",

  async createOnboardingLink(owner) {
    const accountId = await ensureAccount(owner.id, owner.email);
    const link = await stripe().accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      refresh_url: `${env.appUrl}/earnings?onboarding=refresh`,
      return_url: `${env.appUrl}/earnings?onboarding=done`,
    });
    return link.url;
  },

  async startMethodCollection({ booking, tenant, owner, locale }) {
    if (!owner.paymentAccountId) throw new Error("owner not onboarded");
    const customer = await ensureCustomer(tenant.id, owner.paymentAccountId);
    const session = await stripe().checkout.sessions.create(
      {
        mode: "setup",
        currency: "eur",
        customer,
        payment_method_types: ["card", "sepa_debit"],
        locale: locale === "en" ? "en" : "de",
        success_url: `${env.appUrl}/bookings/${booking.id}?checkout=done`,
        cancel_url: `${env.appUrl}/bookings/${booking.id}?checkout=cancel`,
        metadata: { bookingId: booking.id },
        setup_intent_data: { metadata: { bookingId: booking.id } },
      },
      { stripeAccount: owner.paymentAccountId },
    );
    return session.url!;
  },

  async charge({ booking, payment, owner }) {
    if (!owner.paymentAccountId || !booking.paymentMethodRef) throw new Error("missing payment method");
    const customer = await ensureCustomer(booking.tenantId, owner.paymentAccountId);
    try {
      const pi = await stripe().paymentIntents.create(
        {
          amount: booking.priceCents,
          currency: "eur",
          customer,
          payment_method: booking.paymentMethodRef,
          payment_method_types: ["card", "sepa_debit"],
          off_session: true,
          confirm: true,
          description: `Stellplatz ${booking.id.slice(0, 8)}`,
          metadata: { bookingId: booking.id, paymentId: payment.id },
        },
        { stripeAccount: owner.paymentAccountId, idempotencyKey: `charge-${payment.id}` },
      );
      return { providerRef: pi.id };
    } catch (e) {
      // Declines and required authentication arrive as payment_intent.payment_failed webhook.
      const err = e as Stripe.errors.StripeError;
      const pi = (err.raw as { payment_intent?: { id: string } } | undefined)?.payment_intent;
      return { providerRef: pi?.id ?? null };
    }
  },

  async startRetry({ booking, payment, tenant, owner, locale }) {
    if (!owner.paymentAccountId) throw new Error("owner not onboarded");
    const customer = await ensureCustomer(tenant.id, owner.paymentAccountId);
    const session = await stripe().checkout.sessions.create(
      {
        mode: "payment",
        customer,
        payment_method_types: ["card", "sepa_debit"],
        locale: locale === "en" ? "en" : "de",
        line_items: [
          {
            quantity: 1,
            price_data: { currency: "eur", unit_amount: booking.priceCents, product_data: { name: "Stellplatz-Miete" } },
          },
        ],
        payment_intent_data: { metadata: { bookingId: booking.id, paymentId: payment.id } },
        metadata: { bookingId: booking.id, paymentId: payment.id },
        success_url: `${env.appUrl}/bookings/${booking.id}?checkout=done`,
        cancel_url: `${env.appUrl}/bookings/${booking.id}?checkout=cancel`,
      },
      { stripeAccount: owner.paymentAccountId },
    );
    return session.url!;
  },

  async refund({ payment, owner }) {
    if (!payment.providerRef || !owner.paymentAccountId) throw new Error("payment cannot be refunded");
    await stripe().refunds.create(
      { payment_intent: payment.providerRef, metadata: { paymentId: payment.id } },
      { stripeAccount: owner.paymentAccountId, idempotencyKey: `refund-${payment.id}` },
    );
  },

  async parseWebhook(rawBody, headers): Promise<PaymentEvent | null> {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
    const event = stripe().webhooks.constructEvent(rawBody, headers.get("stripe-signature") ?? "", secret);
    const id = event.id;
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object;
        if (s.mode !== "setup" || !s.setup_intent) return null;
        const si = await stripe().setupIntents.retrieve(
          typeof s.setup_intent === "string" ? s.setup_intent : s.setup_intent.id,
          { expand: ["payment_method"] },
          { stripeAccount: event.account },
        );
        const pm = si.payment_method as Stripe.PaymentMethod | null;
        if (!pm || !s.metadata?.bookingId) return null;
        return { id, type: "method_saved", bookingId: s.metadata.bookingId, paymentMethodRef: pm.id, methodType: pm.type };
      }
      case "payment_intent.processing": {
        const pi = event.data.object;
        return { id, type: "payment_processing", paymentId: pi.metadata?.paymentId, providerRef: pi.id };
      }
      case "payment_intent.succeeded": {
        const pi = event.data.object;
        return {
          id,
          type: "payment_succeeded",
          paymentId: pi.metadata?.paymentId,
          providerRef: pi.id,
          methodType: pi.payment_method_types?.[0],
        };
      }
      case "payment_intent.payment_failed": {
        const pi = event.data.object;
        return {
          id,
          type: "payment_failed",
          paymentId: pi.metadata?.paymentId,
          providerRef: pi.id,
          failureCode: pi.last_payment_error?.code ?? pi.last_payment_error?.decline_code ?? "failed",
        };
      }
      case "charge.refunded": {
        const ch = event.data.object;
        if (!ch.refunded) return null;
        return { id, type: "refund_succeeded", providerRef: piRef(ch.payment_intent) };
      }
      case "account.updated": {
        const acc = event.data.object;
        return { id, type: "account_updated", accountRef: acc.id, chargesEnabled: Boolean(acc.charges_enabled) };
      }
      default:
        return null;
    }
  },

  async listPayouts(owner): Promise<PayoutInfo[]> {
    if (!owner.paymentAccountId || !owner.paymentOnboarded) return [];
    const list = await stripe().payouts.list({ limit: 24 }, { stripeAccount: owner.paymentAccountId });
    return list.data.map((p) => ({
      id: p.id,
      amountCents: p.amount,
      status: p.status as PayoutInfo["status"],
      arrivalDate: p.arrival_date ? new Date(p.arrival_date * 1000) : null,
    }));
  },
};
