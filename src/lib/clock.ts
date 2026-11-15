/**
 * Central clock. With DEV_TOOLS=true the admin can shift the time on /dev to test
 * horizons, expiry and reminders without waiting. In production the offset is always 0.
 */
const g = globalThis as unknown as { __clockOffsetMs?: number };

export function now(): Date {
  return new Date(Date.now() + (process.env.DEV_TOOLS === "true" ? g.__clockOffsetMs ?? 0 : 0));
}

export function setClockOffset(ms: number) {
  g.__clockOffsetMs = ms;
}

export function getClockOffset(): number {
  return g.__clockOffsetMs ?? 0;
}
