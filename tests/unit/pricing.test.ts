import { describe, expect, it } from "vitest";
import { calculatePriceCents, estimateFeeCents, estimatePayoutCents, parseEuroToCents } from "@/lib/domain/pricing";
import { DAY, HOUR, MINUTE, parseLocal } from "@/lib/domain/time";

describe("price (T-17)", () => {
  const hourly = 200; // 2 €
  const daily = 1000; // 10 €
  it("charges started hours", () => {
    expect(calculatePriceCents(1 * HOUR, hourly, daily)).toBe(200);
    expect(calculatePriceCents(1 * HOUR + 15 * MINUTE, hourly, daily)).toBe(400);
  });
  it("caps the remainder at one daily price", () => {
    expect(calculatePriceCents(6 * HOUR, hourly, daily)).toBe(1000);
    expect(calculatePriceCents(23 * HOUR, hourly, daily)).toBe(1000);
  });
  it("charges full days plus remainder", () => {
    expect(calculatePriceCents(DAY, hourly, daily)).toBe(1000);
    expect(calculatePriceCents(DAY + 2 * HOUR, hourly, daily)).toBe(1400);
    expect(calculatePriceCents(3 * DAY + 10 * HOUR, hourly, daily)).toBe(4000);
  });
  it("uses the cheaper of daily price and 24 x hourly for full days", () => {
    expect(calculatePriceCents(DAY, 10, 1000)).toBe(240);
  });
  it("supports free spots", () => {
    expect(calculatePriceCents(5 * DAY, 0, 0)).toBe(0);
  });
  it("uses real duration across DST change (T-16)", () => {
    // 25.10.2026: clocks go back, 00:00 -> 00:00 next day is 25 h
    const start = parseLocal("2026-10-25", "00:00")!;
    const end = parseLocal("2026-10-26", "00:00")!;
    expect(end.getTime() - start.getTime()).toBe(25 * HOUR);
    expect(calculatePriceCents(end.getTime() - start.getTime(), hourly, daily)).toBe(1200);
  });
});

describe("fees (Z-05)", () => {
  it("estimates card and SEPA fees", () => {
    expect(estimateFeeCents(1000, "card")).toBe(40);
    expect(estimateFeeCents(1000, "sepa_debit")).toBe(35);
    expect(estimatePayoutCents(1000)).toBe(960);
    expect(estimatePayoutCents(0)).toBe(0);
  });
  it("parses euro input", () => {
    expect(parseEuroToCents("2,50")).toBe(250);
    expect(parseEuroToCents("0")).toBe(0);
    expect(parseEuroToCents("-1")).toBeNull();
    expect(parseEuroToCents("abc")).toBeNull();
  });
});
