import { describe, expect, it } from "vitest";
import {
  computeAvailability,
  expandRule,
  isCoveredBy,
  mergeIntervals,
  overlaps,
  overlapsAny,
  subtractIntervals,
  type Interval,
} from "@/lib/domain/availability";
import { HOUR, parseLocal } from "@/lib/domain/time";

const at = (d: string, t = "00:00") => parseLocal(d, t)!;
const iv = (a: Date, b: Date): Interval => ({ start: a.getTime(), end: b.getTime() });
const range = iv(at("2026-10-12"), at("2026-11-02")); // Mon 12.10. - Mon 02.11.

describe("interval helpers", () => {
  it("detects overlaps with half-open intervals", () => {
    expect(overlaps({ start: 0, end: 10 }, { start: 10, end: 20 })).toBe(false);
    expect(overlaps({ start: 0, end: 10 }, { start: 9, end: 20 })).toBe(true);
    expect(overlapsAny([{ start: 0, end: 5 }, { start: 30, end: 40 }], { start: 5, end: 30 })).toBe(false);
  });
  it("merges touching intervals and subtracts", () => {
    expect(mergeIntervals([{ start: 5, end: 10 }, { start: 0, end: 5 }])).toEqual([{ start: 0, end: 10 }]);
    expect(subtractIntervals([{ start: 0, end: 10 }], [{ start: 3, end: 5 }])).toEqual([
      { start: 0, end: 3 },
      { start: 5, end: 10 },
    ]);
  });
});

describe("rules (P-05)", () => {
  it("weekly Mo-Fr 08-17", () => {
    const w = expandRule(
      { kind: "WEEKLY", startsAt: at("2026-10-01"), weekdays: [1, 2, 3, 4, 5], startMin: 8 * 60, endMin: 17 * 60, validUntil: null },
      range,
    );
    expect(w).toHaveLength(15);
    expect(w[0]).toEqual(iv(at("2026-10-12", "08:00"), at("2026-10-12", "17:00")));
    expect(isCoveredBy(w, iv(at("2026-10-14", "09:00"), at("2026-10-14", "12:00")))).toBe(true);
    expect(isCoveredBy(w, iv(at("2026-10-14", "16:00"), at("2026-10-14", "18:00")))).toBe(false);
    expect(isCoveredBy(w, iv(at("2026-10-17", "09:00"), at("2026-10-17", "10:00")))).toBe(false); // Saturday
  });
  it("weekly window keeps local time across DST", () => {
    const w = expandRule(
      { kind: "WEEKLY", startsAt: at("2026-10-01"), weekdays: [1], startMin: 8 * 60, endMin: 17 * 60, validUntil: null },
      range,
    );
    // Mondays 19.10. (CEST) and 26.10. (CET): both 08:00 local
    expect(w[1].start).toBe(at("2026-10-19", "08:00").getTime());
    expect(w[2].start).toBe(at("2026-10-26", "08:00").getTime());
    expect(w[2].start - w[1].start).toBe(7 * 24 * HOUR + HOUR);
  });
  it("overnight weekly window", () => {
    const w = expandRule(
      { kind: "WEEKLY", startsAt: at("2026-10-01"), weekdays: [5], startMin: 18 * 60, endMin: 8 * 60, validUntil: null },
      range,
    );
    expect(w[0]).toEqual(iv(at("2026-10-16", "18:00"), at("2026-10-17", "08:00")));
  });
  it("every weekend: Saturday 00:00 to Monday 00:00", () => {
    const w = expandRule({ kind: "WEEKENDS", startsAt: at("2026-10-01"), validUntil: null }, range);
    expect(w[0]).toEqual(iv(at("2026-10-17"), at("2026-10-19")));
    expect(w).toHaveLength(3);
  });
  it("always, with end date", () => {
    const w = expandRule({ kind: "ALWAYS", startsAt: at("2026-10-01"), validUntil: at("2026-10-20") }, range);
    expect(w).toEqual([iv(at("2026-10-12"), at("2026-10-20"))]);
  });
  it("P-06: blocks win over every rule", () => {
    const a = computeAvailability(
      [{ kind: "ALWAYS", startsAt: at("2026-10-01"), validUntil: null }],
      [{ startsAt: at("2026-10-20", "10:00"), endsAt: at("2026-10-21", "10:00") }],
      range,
    );
    expect(a).toHaveLength(2);
    expect(isCoveredBy(a, iv(at("2026-10-20", "09:00"), at("2026-10-20", "11:00")))).toBe(false);
    expect(isCoveredBy(a, iv(at("2026-10-21", "10:00"), at("2026-10-21", "11:00")))).toBe(true);
  });
  it("consecutive windows merge so multi-day requests fit", () => {
    const a = computeAvailability(
      [{ kind: "WEEKLY", startsAt: at("2026-10-01"), weekdays: [1, 2, 3, 4, 5, 6, 7], startMin: 0, endMin: 0, validUntil: null }],
      [],
      range,
    );
    expect(isCoveredBy(a, iv(at("2026-10-14", "12:00"), at("2026-10-18", "12:00")))).toBe(true);
  });
});
