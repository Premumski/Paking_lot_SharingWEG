import type { Booking, Payment, User } from "@prisma/client";

/** Provider-neutral events. Payment state changes only through verified webhooks (Z-09). */
export type PaymentEvent =
  | { id: string; type: "method_saved"; bookingId: string; paymentMethodRef: string; methodType: string; customerRef?: string }
  | { id: string; type: "payment_processing"; paymentId?: string; providerRef?: string }
  | { id: string; type: "payment_succeeded"; paymentId?: string; providerRef?: string; methodType?: string }
  | { id: string; type: "payment_failed"; paymentId?: string; providerRef?: string; failureCode?: string }
  | { id: string; type: "refund_succeeded"; paymentId?: string; providerRef?: string }
  | { id: string; type: "account_updated"; accountRef: string; chargesEnabled: boolean };

export interface PayoutInfo {
  id: string;
  amountCents: number;
  status: "pending" | "in_transit" | "paid" | "failed" | "canceled";
  arrivalDate: Date | null;
}

/** Z-02: payment adapter interface, so that e.g. Mollie Connect can be added later. */
export interface PaymentAdapter {
  readonly name: "mock" | "stripe";
  /** Z-03: hosted onboarding (identity, IBAN) for owners. */
  createOnboardingLink(owner: User): Promise<string>;
  /** Z-04/Z-05: hosted page where the tenant enters a card or SEPA mandate; nothing is charged yet. */
  startMethodCollection(params: { booking: Booking; tenant: User; owner: User; locale: string }): Promise<string>;
  /** Charges the saved method off-session at confirmation. The outcome arrives as webhook. */
  charge(params: { booking: Booking; payment: Payment; owner: User; tenant: User }): Promise<{ providerRef: string | null }>;
  /** Z-06: hosted page where the tenant pays again after a failed charge. */
  startRetry(params: { booking: Booking; payment: Payment; owner: User; tenant: User; locale: string }): Promise<string>;
  /** Z-08: full refund. The outcome arrives as webhook. */
  refund(params: { payment: Payment; owner: User }): Promise<void>;
  /** Verifies the signature and normalises the event. Returns null for irrelevant events. */
  parseWebhook(rawBody: string, headers: Headers): Promise<PaymentEvent | null>;
  listPayouts(owner: User): Promise<PayoutInfo[]>;
}
