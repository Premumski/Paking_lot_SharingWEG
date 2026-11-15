import { DAY, HOUR } from "./time";

/**
 * T-17: cheapest variant. Each full 24 h costs the daily price (or 24 x hourly if
 * that is cheaper); the remainder costs hourly x started hours, at most one daily price.
 * Uses the real elapsed duration (T-16).
 */
export function calculatePriceCents(
  durationMs: number,
  pricePerHourCents: number,
  pricePerDayCents: number,
): number {
  if (durationMs <= 0) return 0;
  const fullDays = Math.floor(durationMs / DAY);
  const restMs = durationMs - fullDays * DAY;
  const startedHours = Math.ceil(restMs / HOUR);
  const dayPrice = Math.min(pricePerDayCents, 24 * pricePerHourCents);
  const restPrice = Math.min(startedHours * pricePerHourCents, pricePerDayCents);
  return fullDays * dayPrice + restPrice;
}

export type MethodKind = "card" | "sepa_debit";

export interface FeeConfig {
  cardPercent: number;
  cardFixedCents: number;
  sepaFixedCents: number;
}

export const DEFAULT_FEES: FeeConfig = {
  // Stripe standard pricing for EEA cards and SEPA Direct Debit in Germany (estimate only).
  cardPercent: 1.5,
  cardFixedCents: 25,
  sepaFixedCents: 35,
};

/** Z-05: estimated provider fee charged to the owner. */
export function estimateFeeCents(amountCents: number, method: MethodKind, fees: FeeConfig = DEFAULT_FEES): number {
  if (amountCents <= 0) return 0;
  if (method === "sepa_debit") return Math.min(fees.sepaFixedCents, amountCents);
  return Math.min(Math.round((amountCents * fees.cardPercent) / 100) + fees.cardFixedCents, amountCents);
}

/** Owner payout after fee; for display the worse (higher fee) method is shown when unknown. */
export function estimatePayoutCents(amountCents: number, method?: MethodKind, fees: FeeConfig = DEFAULT_FEES): number {
  if (amountCents <= 0) return 0;
  const fee = method
    ? estimateFeeCents(amountCents, method, fees)
    : Math.max(estimateFeeCents(amountCents, "card", fees), estimateFeeCents(amountCents, "sepa_debit", fees));
  return amountCents - fee;
}

export function formatEuro(cents: number, locale = "de"): string {
  return new Intl.NumberFormat(locale === "en" ? "en-IE" : "de-DE", { style: "currency", currency: "EUR" }).format(
    cents / 100,
  );
}

/** Parses "12,50" / "12.50" / "12" to cents. Returns null for invalid or negative input. */
export function parseEuroToCents(input: string): number | null {
  const s = input.trim().replace(/\s|€/g, "").replace(",", ".");
  if (s === "") return 0;
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}
