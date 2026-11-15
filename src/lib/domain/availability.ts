import { addLocalDays, fromLocal, startOfLocalDay, toLocalParts } from "./time";

/** Half-open interval [start, end) in epoch milliseconds. */
export interface Interval {
  start: number;
  end: number;
}

export type RuleInput =
  | { kind: "MANUAL"; startsAt: Date; endsAt: Date | null }
  | {
      kind: "WEEKLY";
      startsAt: Date;
      weekdays: number[];
      startMin: number;
      endMin: number;
      validUntil: Date | null;
    }
  | { kind: "WEEKENDS"; startsAt: Date; validUntil: Date | null }
  | { kind: "ALWAYS"; startsAt: Date; validUntil: Date | null };

export interface BlockInput {
  startsAt: Date;
  endsAt: Date;
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

export function contains(outer: Interval, inner: Interval): boolean {
  return outer.start <= inner.start && inner.end <= outer.end;
}

/** Sorts and merges overlapping or touching intervals. */
export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = list.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ ...i });
  }
  return out;
}

/** Removes all `cut` intervals from `base`. */
export function subtractIntervals(base: Interval[], cut: Interval[]): Interval[] {
  let result = mergeIntervals(base);
  for (const c of mergeIntervals(cut)) {
    const next: Interval[] = [];
    for (const b of result) {
      if (!overlaps(b, c)) {
        next.push(b);
        continue;
      }
      if (b.start < c.start) next.push({ start: b.start, end: c.start });
      if (c.end < b.end) next.push({ start: c.end, end: b.end });
    }
    result = next;
  }
  return result;
}

function clip(i: Interval, range: Interval): Interval | null {
  const start = Math.max(i.start, range.start);
  const end = Math.min(i.end, range.end);
  return end > start ? { start, end } : null;
}

/** Expands one rule into concrete windows within `range` (P-05, T-13). */
export function expandRule(rule: RuleInput, range: Interval): Interval[] {
  const ruleStart = rule.startsAt.getTime();
  if (rule.kind === "MANUAL") {
    const end = rule.endsAt ? rule.endsAt.getTime() : range.end;
    const c = clip({ start: ruleStart, end }, range);
    return c ? [c] : [];
  }
  const ruleEnd = rule.validUntil ? rule.validUntil.getTime() : Number.POSITIVE_INFINITY;
  const effective: Interval = { start: Math.max(range.start, ruleStart), end: Math.min(range.end, ruleEnd) };
  if (effective.end <= effective.start) return [];

  if (rule.kind === "ALWAYS") return [effective];

  const out: Interval[] = [];
  // Walk local days, starting one day earlier to catch overnight windows.
  let day = addLocalDays(startOfLocalDay(new Date(effective.start)), -1);
  while (day.getTime() < effective.end) {
    const p = toLocalParts(day);
    if (rule.kind === "WEEKENDS") {
      if (p.weekday === 6) {
        const start = day.getTime();
        const end = addLocalDays(day, 2).getTime(); // Saturday 00:00 -> Monday 00:00
        const c = clip({ start, end }, effective);
        if (c) out.push(c);
      }
    } else if (rule.weekdays.includes(p.weekday)) {
      const start = fromLocal(p.year, p.month, p.day, 0, rule.startMin).getTime();
      const endDayOffset = rule.endMin <= rule.startMin ? 1 : 0;
      const end = fromLocal(p.year, p.month, p.day + endDayOffset, 0, rule.endMin).getTime();
      const c = clip({ start, end }, effective);
      if (c) out.push(c);
    }
    day = addLocalDays(day, 1);
  }
  return out;
}

/**
 * Availability of a spot in `range`: union of all rules minus owner blocks (P-06 blocks win).
 * Pausing (P-08) is handled by the caller.
 */
export function computeAvailability(rules: RuleInput[], blocks: BlockInput[], range: Interval): Interval[] {
  const windows = mergeIntervals(rules.flatMap((r) => expandRule(r, range)));
  const cuts = blocks.map((b) => ({ start: b.startsAt.getTime(), end: b.endsAt.getTime() }));
  return subtractIntervals(windows, cuts);
}

/** True if `request` lies completely inside one availability window. */
export function isCoveredBy(windows: Interval[], request: Interval): boolean {
  return windows.some((w) => contains(w, request));
}

/** True if `request` overlaps any of `busy`. */
export function overlapsAny(busy: Interval[], request: Interval): boolean {
  return busy.some((b) => overlaps(b, request));
}
