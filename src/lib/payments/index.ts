import { env } from "../env";
import { mockAdapter } from "./mock";
import { stripeAdapter } from "./stripe";
import type { PaymentAdapter } from "./types";

export function paymentAdapter(): PaymentAdapter {
  return env.paymentProvider === "stripe" ? stripeAdapter : mockAdapter;
}

export function adapterByName(name: string): PaymentAdapter {
  return name === "stripe" ? stripeAdapter : mockAdapter;
}
