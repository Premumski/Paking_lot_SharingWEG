import { describe, expect, it } from "vitest";
import { checkHorizon, DEFAULT_SETTINGS, latestStart, tierForDuration } from "@/lib/domain/horizon";
import { DAY, HOUR, MINUTE, parseLocal, WEEK, addLocalMonths, localDateString } from "@/lib/domain/time";

const at = (d: string, t = "00:00") => parseLocal(d, t)!;
const now = at("2026-10-16", "16:00"); // Friday, from the spec example

describe("tiers (T-01..T-03)", () => {
  it("classifies by real duration", () => {
    expect(tierForDuration(3 * HOUR)).toBe(1);
    expect(tierForDuration(DAY - MINUTE)).toBe(1);
    expect(tierForDuration(DAY)).toBe(2);
    expect(tierForDuration(WEEK - MINUTE)).toBe(2);
    expect(tierForDuration(WEEK)).toBe(3);
  });
});

describe("spec example (Freitag 16.10.2026 16:00)", () => {
  it("3 hours: latest start 18.10. 16:00", () => {
    expect(latestStart(now, 1, DEFAULT_SETTINGS)).toEqual(at("2026-10-18", "16:00"));
    const ok = checkHorizon({ now, start: at("2026-10-18", "16:00"), end: at("2026-10-18", "19:00"), settings: DEFAULT_SETTINGS });
    expect(ok.ok).toBe(true);
    const late = checkHorizon({ now, start: at("2026-10-18", "16:15"), end: at("2026-10-18", "19:15"), settings: DEFAULT_SETTINGS });
    expect(late.error).toBe("tooFarAhead");
  });
  it("3 days: latest start 30.10. (across DST change, same wall clock)", () => {
    const l = latestStart(now, 2, DEFAULT_SETTINGS);
    expect(l).toEqual(at("2026-10-30", "16:00"));
    const r = checkHorizon({ now, start: at("2026-10-30", "16:00"), end: at("2026-11-02", "16:00"), settings: DEFAULT_SETTINGS });
    expect(r.ok).toBe(true);
    expect(r.tier).toBe(2);
  });
  it("2 weeks: latest start 16.11.2026", () => {
    expect(latestStart(now, 3, DEFAULT_SETTINGS)).toEqual(at("2026-11-16", "16:00"));
    const r = checkHorizon({ now, start: at("2026-11-16", "16:00"), end: at("2026-11-30", "16:00"), settings: DEFAULT_SETTINGS });
    expect(r.ok).toBe(true);
  });
  it("5 weeks is not possible (T-04 max duration)", () => {
    const r = checkHorizon({ now, start: at("2026-10-20", "10:00"), end: at("2026-11-24", "10:00"), settings: DEFAULT_SETTINGS });
    expect(r.error).toBe("tooLong");
  });
});

describe("other rules", () => {
  it("T-11: one month = same calendar day next month, clamped", () => {
    expect(localDateString(addLocalMonths(at("2026-01-31", "10:00"), 1))).toBe("2026-02-28");
    expect(addLocalMonths(at("2026-10-16", "16:00"), 1)).toEqual(at("2026-11-16", "16:00"));
  });
  it("T-07: minimum duration", () => {
    const r = checkHorizon({ now, start: at("2026-10-17", "10:00"), end: at("2026-10-17", "10:45"), settings: DEFAULT_SETTINGS });
    expect(r.error).toBe("tooShort");
  });
  it("P-04: 15 minute slots", () => {
    const r = checkHorizon({ now, start: at("2026-10-17", "10:10"), end: at("2026-10-17", "12:10"), settings: DEFAULT_SETTINGS });
    expect(r.error).toBe("notOnSlot");
  });
  it("T-06: minimum lead time", () => {
    const s = { ...DEFAULT_SETTINGS, minLeadMinutes: 120 };
    expect(checkHorizon({ now, start: at("2026-10-16", "17:00"), end: at("2026-10-16", "19:00"), settings: s }).error).toBe("tooSoon");
    expect(checkHorizon({ now, start: at("2026-10-16", "18:00"), end: at("2026-10-16", "20:00"), settings: s }).ok).toBe(true);
  });
  it("allows the current 15 minute slot when lead time is 0", () => {
    const n = at("2026-10-16", "16:07");
    expect(checkHorizon({ now: n, start: at("2026-10-16", "16:00"), end: at("2026-10-16", "18:00"), settings: DEFAULT_SETTINGS }).ok).toBe(true);
    expect(checkHorizon({ now: n, start: at("2026-10-16", "15:45"), end: at("2026-10-16", "18:00"), settings: DEFAULT_SETTINGS }).error).toBe("tooSoon");
  });
  it("T-05: spot can shorten but not extend a tier", () => {
    expect(latestStart(now, 1, DEFAULT_SETTINGS, { tier1Minutes: 60, tier2Days: null, tier3Months: null })).toEqual(at("2026-10-16", "17:00"));
    expect(latestStart(now, 2, DEFAULT_SETTINGS, { tier1Minutes: null, tier2Days: 60, tier3Months: null })).toEqual(at("2026-10-30", "16:00"));
  });
  it("T-12: extension uses total duration for the tier", () => {
    // Booking 16.10. 16:00 - 17.10. 12:00 (20 h) extended to 18.10. 12:00 -> total 44 h -> tier 2
    const r = checkHorizon({
      now: at("2026-10-17", "10:00"),
      start: at("2026-10-17", "12:00"),
      end: at("2026-10-18", "12:00"),
      totalStart: at("2026-10-16", "16:00"),
      settings: DEFAULT_SETTINGS,
      isExtension: true,
    });
    expect(r.ok).toBe(true);
    expect(r.tier).toBe(2);
  });
});
