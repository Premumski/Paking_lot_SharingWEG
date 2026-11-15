/**
 * Time helpers for Europe/Berlin (T-16). All instants are stored as UTC `Date`s.
 * Durations are always real elapsed time; calendar arithmetic (days, months)
 * is done on Berlin wall-clock time.
 */
export const TZ = "Europe/Berlin";
export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
export const WEEK = 7 * DAY;
export const SLOT_MINUTES = 15;

const dtf = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  weekday: "short",
});

export interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** ISO weekday, 1 = Monday ... 7 = Sunday */
  weekday: number;
}

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function toLocalParts(date: Date): LocalParts {
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) parts[p.type] = p.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAYS[parts.weekday] ?? 1,
  };
}

function offsetMs(date: Date): number {
  const p = toLocalParts(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Converts a Berlin wall-clock time to an instant. Overflowing values (e.g. day 32) are normalised. */
export function fromLocal(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const off1 = offsetMs(new Date(guess));
  let t = guess - off1;
  const off2 = offsetMs(new Date(t));
  if (off2 !== off1) t = guess - off2;
  return new Date(t);
}

/** Parses "YYYY-MM-DD" and "HH:mm" in Berlin time. */
export function parseLocal(date: string, time = "00:00"): Date | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const tm = /^(\d{2}):(\d{2})$/.exec(time);
  if (!dm || !tm) return null;
  const [y, mo, d] = [Number(dm[1]), Number(dm[2]), Number(dm[3])];
  const [h, mi] = [Number(tm[1]), Number(tm[2])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 24 || mi > 59) return null;
  if (h === 24 && mi !== 0) return null;
  const result = fromLocal(y, mo, d, h, mi);
  return Number.isNaN(result.getTime()) ? null : result;
}

/** "YYYY-MM-DD" in Berlin time */
export function localDateString(date: Date): string {
  const p = toLocalParts(date);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** "HH:mm" in Berlin time */
export function localTimeString(date: Date): string {
  const p = toLocalParts(date);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

export function startOfLocalDay(date: Date): Date {
  const p = toLocalParts(date);
  return fromLocal(p.year, p.month, p.day);
}

/** Adds calendar days keeping the Berlin wall-clock time. */
export function addLocalDays(date: Date, days: number): Date {
  const p = toLocalParts(date);
  return fromLocal(p.year, p.month, p.day + days, p.hour, p.minute);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * T-11: "1 Monat" = same calendar day in the following month, same time.
 * If that day does not exist (31.01. -> Feb), the last day of the month is used.
 */
export function addLocalMonths(date: Date, months: number): Date {
  const p = toLocalParts(date);
  const total = p.year * 12 + (p.month - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const day = Math.min(p.day, daysInMonth(year, month));
  return fromLocal(year, month, day, p.hour, p.minute);
}

export function isOnSlot(date: Date): boolean {
  return date.getTime() % (SLOT_MINUTES * MINUTE) === 0;
}

export function floorToSlot(date: Date): Date {
  const step = SLOT_MINUTES * MINUTE;
  return new Date(Math.floor(date.getTime() / step) * step);
}

export function ceilToSlot(date: Date): Date {
  const step = SLOT_MINUTES * MINUTE;
  return new Date(Math.ceil(date.getTime() / step) * step);
}
