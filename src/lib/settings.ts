import type { Settings } from "@prisma/client";
import { prisma } from "./db";
import type { HorizonSettings } from "./domain/horizon";

export async function getSettings(): Promise<Settings> {
  const s = await prisma.settings.findUnique({ where: { id: 1 } });
  return s ?? prisma.settings.create({ data: { id: 1 } });
}

export function toHorizonSettings(s: Settings): HorizonSettings {
  return {
    tier1Minutes: s.tier1Minutes,
    tier2Days: s.tier2Days,
    tier3Months: s.tier3Months,
    maxDurationValue: s.maxDurationValue,
    maxDurationUnit: s.maxDurationUnit === "DAY" ? "DAY" : "MONTH",
    minLeadMinutes: s.minLeadMinutes,
    minDurationMinutes: s.minDurationMinutes,
  };
}
