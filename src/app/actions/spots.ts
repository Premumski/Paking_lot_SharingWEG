"use server";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { now } from "@/lib/clock";
import { AppError, toActionError, type ActionResult } from "@/lib/errors";
import { parseEuroToCents } from "@/lib/domain/pricing";
import { SETTINGS_RANGES } from "@/lib/domain/horizon";
import { isOnSlot, parseLocal } from "@/lib/domain/time";
import { changeAvailability, requireOwnedSpot } from "@/lib/booking/owner";
import { getSettings } from "@/lib/settings";
import { formatDateTime } from "@/i18n/server";

function intOrNull(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isInteger(n) ? n : NaN;
}

/** P-03 / P-07 / T-05 / Z-03 */
export async function updateSpotAction(spotId: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { user } = await requireUser();
  try {
    await requireOwnedSpot(spotId, user.id);
    const hourly = parseEuroToCents(String(fd.get("pricePerHour") ?? "0"));
    const daily = parseEuroToCents(String(fd.get("pricePerDay") ?? "0"));
    if (hourly === null || daily === null) throw new AppError("spot.invalidPrice");
    if ((hourly > 0 || daily > 0) && !user.paymentOnboarded) throw new AppError("spot.onboardingRequired");
    const instantValue = Number(fd.get("instantValue") ?? 4);
    const unit = String(fd.get("instantUnit") ?? "hours");
    const factor = unit === "days" ? 1440 : unit === "minutes" ? 1 : 60;
    const instantMaxMinutes = Math.round(instantValue * factor);
    const r = SETTINGS_RANGES.instantMaxMinutes;
    if (!Number.isFinite(instantMaxMinutes) || instantMaxMinutes < r.min || instantMaxMinutes > r.max) throw new AppError("spot.instantRange");

    const settings = await getSettings();
    const tier1Hours = intOrNull(fd.get("tier1Hours"));
    const tier2Days = intOrNull(fd.get("tier2Days"));
    const tier3Months = intOrNull(fd.get("tier3Months"));
    const tier1Minutes = tier1Hours === null ? null : tier1Hours * 60;
    // T-05: owners can only shorten.
    if ([tier1Minutes, tier2Days, tier3Months].some((v) => Number.isNaN(v) || (v !== null && v < 1))) throw new AppError("spot.tierInvalid");
    if ((tier1Minutes ?? 0) > settings.tier1Minutes || (tier2Days ?? 0) > settings.tier2Days || (tier3Months ?? 0) > settings.tier3Months) {
      throw new AppError("spot.tierAboveGlobal");
    }
    await prisma.parkingSpot.update({
      where: { id: spotId },
      data: {
        pricePerHourCents: hourly,
        pricePerDayCents: daily,
        description: String(fd.get("description") ?? "").slice(0, 1000),
        accessNotes: String(fd.get("accessNotes") ?? "").slice(0, 1000),
        instantBooking: fd.get("instantBooking") === "on",
        instantMaxMinutes,
        tier1Minutes,
        tier2Days,
        tier3Months,
      },
    });
    await audit("spot.updated", { actorId: user.id, entityType: "ParkingSpot", entityId: spotId, details: { hourly, daily, instant: fd.get("instantBooking") === "on" } });
    return { ok: true, message: "saved" };
  } catch (e) {
    return toActionError(e);
  }
}

/** P-08: one-click pause; confirmed bookings stay valid and are listed. */
export async function togglePauseAction(spotId: string, _: ActionResult | null): Promise<ActionResult> {
  const { user } = await requireUser();
  try {
    const spot = await requireOwnedSpot(spotId, user.id);
    const paused = !spot.paused;
    await prisma.parkingSpot.update({ where: { id: spotId }, data: { paused } });
    await audit(paused ? "spot.paused" : "spot.resumed", { actorId: user.id, entityType: "ParkingSpot", entityId: spotId });
    if (!paused) return { ok: true, message: "spotResumed" };
    const remaining = await prisma.booking.findMany({
      where: { spotId, status: "CONFIRMED", endsAt: { gt: now() } },
      orderBy: { startsAt: "asc" },
      include: { tenant: { select: { name: true } } },
    });
    return {
      ok: true,
      message: "spotPaused",
      params: { count: remaining.length },
      data: { bookings: remaining.map((b) => ({ id: b.id, label: `${formatDateTime(b.startsAt, user.locale)} – ${formatDateTime(b.endsAt, user.locale)} · ${b.tenant.name}` })) },
    };
  } catch (e) {
    return toActionError(e);
  }
}

function minutesOf(time: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return v % 15 === 0 && v <= 1440 ? v : null;
}

/** P-04 / P-05 */
export async function addRuleAction(spotId: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { user } = await requireUser();
  try {
    await requireOwnedSpot(spotId, user.id);
    const kind = String(fd.get("kind"));
    const t = now();
    const untilRaw = String(fd.get("validUntil") ?? "");
    // End date is inclusive in the UI -> exclusive instant at the next midnight.
    const validUntil = untilRaw ? parseLocal(untilRaw, "24:00") : null;
    if (untilRaw && !validUntil) throw new AppError("spot.invalidDate");
    if (kind === "MANUAL") {
      const start = parseLocal(String(fd.get("fromDate")), String(fd.get("fromTime")));
      const end = parseLocal(String(fd.get("toDate")), String(fd.get("toTime")));
      if (!start || !end || end <= start) throw new AppError("spot.invalidRange");
      if (!isOnSlot(start) || !isOnSlot(end)) throw new AppError("spot.notOnSlot");
      if (end <= t) throw new AppError("spot.inPast");
      await prisma.availabilityRule.create({ data: { spotId, kind: "MANUAL", startsAt: start, endsAt: end, weekdays: [] } });
    } else if (kind === "WEEKLY") {
      const weekdays = fd.getAll("weekdays").map(Number).filter((d) => d >= 1 && d <= 7);
      const startMin = minutesOf(String(fd.get("startTime")));
      const endMin = minutesOf(String(fd.get("endTime")));
      if (!weekdays.length) throw new AppError("spot.noWeekdays");
      if (startMin === null || endMin === null || startMin === endMin % 1440 && startMin !== 0) throw new AppError("spot.invalidRange");
      await prisma.availabilityRule.create({
        data: { spotId, kind: "WEEKLY", startsAt: t, weekdays, startMin, endMin: endMin === 1440 ? 0 : endMin, validUntil },
      });
    } else if (kind === "WEEKENDS" || kind === "ALWAYS") {
      await prisma.availabilityRule.create({ data: { spotId, kind, startsAt: t, weekdays: [], validUntil } });
    } else {
      throw new AppError("spot.invalidRule");
    }
    await audit("availability.added", { actorId: user.id, entityType: "ParkingSpot", entityId: spotId, details: { kind } });
    return { ok: true, message: "ruleAdded" };
  } catch (e) {
    return toActionError(e);
  }
}

function conflictResult(conflicts: { id: string; startsAt: Date; endsAt: Date }[], locale: string): ActionResult {
  return {
    ok: false,
    error: "spot.conflicts",
    params: { count: conflicts.length },
    data: { conflicts: conflicts.map((c) => ({ id: c.id, label: `${formatDateTime(c.startsAt, locale)} – ${formatDateTime(c.endsAt, locale)}` })) },
  };
}

/** P-09: deleting a rule that covers confirmed bookings requires cancelling them. */
export async function deleteRuleAction(spotId: string, ruleId: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { user } = await requireUser();
  try {
    const res = await changeAvailability({
      ownerId: user.id,
      spotId,
      removeRuleId: ruleId,
      confirmCancel: fd.get("confirmCancel") === "1",
      reason: String(fd.get("reason") ?? ""),
    });
    if (!res.applied) return conflictResult(res.conflicts, user.locale);
    await prisma.availabilityRule.delete({ where: { id: ruleId } });
    await audit("availability.removed", { actorId: user.id, entityType: "ParkingSpot", entityId: spotId, details: { cancelled: res.cancelled } });
    return { ok: true, message: res.cancelled ? "ruleRemovedCancelled" : "ruleRemoved", params: { count: res.cancelled } };
  } catch (e) {
    return toActionError(e);
  }
}

/** P-06: blocks win over rules; colliding confirmed bookings must be cancelled explicitly (P-09). */
export async function addBlockAction(spotId: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { user } = await requireUser();
  try {
    const start = parseLocal(String(fd.get("fromDate")), String(fd.get("fromTime")));
    const end = parseLocal(String(fd.get("toDate")), String(fd.get("toTime")));
    if (!start || !end || end <= start) throw new AppError("spot.invalidRange");
    if (!isOnSlot(start) || !isOnSlot(end)) throw new AppError("spot.notOnSlot");
    const note = String(fd.get("note") ?? "").slice(0, 200);
    const res = await changeAvailability({
      ownerId: user.id,
      spotId,
      addBlock: { startsAt: start, endsAt: end, note },
      confirmCancel: fd.get("confirmCancel") === "1",
      reason: String(fd.get("reason") ?? ""),
    });
    if (!res.applied) return conflictResult(res.conflicts, user.locale);
    await prisma.blocking.create({ data: { spotId, startsAt: start, endsAt: end, note } });
    await audit("availability.blocked", { actorId: user.id, entityType: "ParkingSpot", entityId: spotId, details: { cancelled: res.cancelled } });
    return { ok: true, message: res.cancelled ? "blockAddedCancelled" : "blockAdded", params: { count: res.cancelled } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function deleteBlockAction(spotId: string, blockId: string, _: ActionResult | null): Promise<ActionResult> {
  const { user } = await requireUser();
  try {
    await requireOwnedSpot(spotId, user.id);
    await prisma.blocking.deleteMany({ where: { id: blockId, spotId } });
    await audit("availability.unblocked", { actorId: user.id, entityType: "ParkingSpot", entityId: spotId });
    return { ok: true, message: "blockRemoved" };
  } catch (e) {
    return toActionError(e);
  }
}

/** Z-03: hosted onboarding at the payment provider. */
export async function startOnboardingAction(_: ActionResult | null): Promise<ActionResult> {
  const { user } = await requireUser();
  try {
    const { paymentAdapter } = await import("@/lib/payments");
    const url = await paymentAdapter().createOnboardingLink(user);
    await audit("payment.onboardingStarted", { actorId: user.id, entityType: "User", entityId: user.id });
    return { ok: true, redirect: url };
  } catch (e) {
    return toActionError(e);
  }
}
