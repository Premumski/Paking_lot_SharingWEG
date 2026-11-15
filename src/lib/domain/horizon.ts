import { addLocalDays, addLocalMonths, DAY, floorToSlot, isOnSlot, MINUTE, WEEK } from "./time";

/** Global settings from the admin area (T-01 ... T-10). */
export interface HorizonSettings {
  tier1Minutes: number;
  tier2Days: number;
  tier3Months: number;
  maxDurationValue: number;
  maxDurationUnit: "DAY" | "MONTH";
  minLeadMinutes: number;
  minDurationMinutes: number;
}

/** Per-spot shortening by the owner (T-05). `null` = use global value. */
export interface SpotHorizon {
  tier1Minutes: number | null;
  tier2Days: number | null;
  tier3Months: number | null;
}

export const DEFAULT_SETTINGS: HorizonSettings = {
  tier1Minutes: 2 * 24 * 60,
  tier2Days: 14,
  tier3Months: 1,
  maxDurationValue: 1,
  maxDurationUnit: "MONTH",
  minLeadMinutes: 0,
  minDurationMinutes: 60,
};

export const SETTINGS_RANGES = {
  tier1Minutes: { min: 60, max: 30 * 24 * 60 },
  tier2Days: { min: 1, max: 90 },
  tier3Months: { min: 1, max: 12 },
  maxDurationDays: { min: 1, max: 366 },
  maxDurationMonths: { min: 1, max: 12 },
  minLeadMinutes: { min: 0, max: 48 * 60 },
  minDurationMinutes: { min: 15, max: 24 * 60 },
  fairnessLimit: { min: 0, max: 100 },
  openRequestLimit: { min: 1, max: 20 },
  requestExpiryHours: { min: 1, max: 168 },
  instantMaxMinutes: { min: 15, max: 365 * 24 * 60 },
} as const;

export type Tier = 1 | 2 | 3;

/** T-01..T-03: tier by total real duration. 1 day = 24 h, 1 week = 7 x 24 h. */
export function tierForDuration(durationMs: number): Tier {
  if (durationMs < DAY) return 1;
  if (durationMs < WEEK) return 2;
  return 3;
}

export function effectiveTiers(settings: HorizonSettings, spot?: SpotHorizon | null) {
  const min = (g: number, s: number | null | undefined) => (s == null ? g : Math.min(g, s));
  return {
    tier1Minutes: min(settings.tier1Minutes, spot?.tier1Minutes),
    tier2Days: min(settings.tier2Days, spot?.tier2Days),
    tier3Months: min(settings.tier3Months, spot?.tier3Months),
  };
}

/** Latest allowed start for a booking of the given tier, measured from `now` (T-14). */
export function latestStart(now: Date, tier: Tier, settings: HorizonSettings, spot?: SpotHorizon | null): Date {
  const t = effectiveTiers(settings, spot);
  if (tier === 1) return new Date(now.getTime() + t.tier1Minutes * MINUTE);
  if (tier === 2) return addLocalDays(now, t.tier2Days);
  return addLocalMonths(now, t.tier3Months);
}

/** T-04: latest allowed end for a booking that begins at `start`. */
export function maxEnd(start: Date, settings: HorizonSettings): Date {
  return settings.maxDurationUnit === "MONTH"
    ? addLocalMonths(start, settings.maxDurationValue)
    : addLocalDays(start, settings.maxDurationValue);
}

export type HorizonError =
  | "invalidRange"
  | "notOnSlot"
  | "tooShort"
  | "tooLong"
  | "tooSoon"
  | "tooFarAhead";

export interface HorizonCheck {
  ok: boolean;
  error?: HorizonError;
  tier: Tier;
  latestStart: Date;
  earliestStart: Date;
  maxEnd: Date;
}

/**
 * Validates a booking period against all time rules (T-01 ... T-07, T-11, T-12, T-14).
 * For an extension (B-09), `totalStart` is the start of the original booking: the tier and
 * the maximum duration use the combined duration, the horizon uses the extension start.
 */
export function checkHorizon(params: {
  now: Date;
  start: Date;
  end: Date;
  settings: HorizonSettings;
  spot?: SpotHorizon | null;
  totalStart?: Date;
  isExtension?: boolean;
}): HorizonCheck {
  const { now, start, end, settings, spot } = params;
  const totalStart = params.totalStart ?? start;
  const totalDuration = end.getTime() - totalStart.getTime();
  const tier = tierForDuration(Math.max(totalDuration, 0));
  const latest = latestStart(now, tier, settings, spot);
  const earliest = floorToSlot(new Date(now.getTime() + settings.minLeadMinutes * MINUTE));
  const limitEnd = maxEnd(totalStart, settings);
  const base = { tier, latestStart: latest, earliestStart: earliest, maxEnd: limitEnd };

  if (!(end.getTime() > start.getTime())) return { ok: false, error: "invalidRange", ...base };
  if (!isOnSlot(start) || !isOnSlot(end)) return { ok: false, error: "notOnSlot", ...base };
  if (totalDuration < settings.minDurationMinutes * MINUTE) return { ok: false, error: "tooShort", ...base };
  if (end.getTime() > limitEnd.getTime()) return { ok: false, error: "tooLong", ...base };
  if (!params.isExtension && start.getTime() < earliest.getTime()) return { ok: false, error: "tooSoon", ...base };
  if (start.getTime() > latest.getTime()) return { ok: false, error: "tooFarAhead", ...base };
  return { ok: true, ...base };
}

/** T-13: how far automatic rules must be expanded: the longest tier. */
export function longestHorizonEnd(now: Date, settings: HorizonSettings): Date {
  const candidates = [
    latestStart(now, 1, settings),
    latestStart(now, 2, settings),
    latestStart(now, 3, settings),
  ];
  const latest = new Date(Math.max(...candidates.map((d) => d.getTime())));
  return maxEnd(latest, settings);
}
