"use server";

import { z } from "zod";
import type { Role, SpotType } from "@prisma/client";
import { requireAdmin, destroyAllSessions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { now } from "@/lib/clock";
import { AppError, toActionError, type ActionResult } from "@/lib/errors";
import { sendInvitation } from "@/lib/invitations";
import { SETTINGS_RANGES } from "@/lib/domain/horizon";
import { looksLikePlanNumber, sanitizeSvg, SvgError } from "@/lib/svg";
import { DrawioError, drawioToLevels, looksLikeDrawio } from "@/lib/drawio";
import { checkPlan, loadPlanLevels, savePlanLevel } from "@/lib/plans";
import { isLocale } from "@/i18n/config";

const SPOT_TYPES: SpotType[] = ["STANDARD", "COMPACT", "LARGE", "EV", "MOTORBIKE", "ACCESSIBLE"];
const UserInput = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(200),
  apartment: z.string().trim().min(1).max(40),
  role: z.enum(["ADMIN", "RESIDENT"]).default("RESIDENT"),
  locale: z.string().default("de"),
});

async function openBookingCount(userId: string) {
  return prisma.booking.count({
    where: {
      OR: [{ tenantId: userId }, { ownerId: userId }],
      status: { in: ["DRAFT", "REQUESTED", "CONFIRMED"] },
      endsAt: { gt: now() },
    },
  });
}

/** A-01 / R-02 */
export async function createUserAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { user: admin } = await requireAdmin();
  try {
    const parsed = UserInput.safeParse(Object.fromEntries(fd));
    if (!parsed.success) throw new AppError("admin.invalidUser");
    const { name, email, apartment, role, locale } = parsed.data;
    if (await prisma.user.findUnique({ where: { email } })) throw new AppError("admin.emailExists");
    const user = await prisma.user.create({ data: { name, email, apartment, role, locale: isLocale(locale) ? locale : "de", status: "INVITED" } });
    await sendInvitation(user);
    await audit("user.created", { actorId: admin.id, entityType: "User", entityId: user.id, details: { role } });
    return { ok: true, message: "userCreated" };
  } catch (e) {
    return toActionError(e);
  }
}

/** A-01: CSV import (name;email;apartment[;role][;language]) for the initial setup. */
export async function importUsersAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { user: admin } = await requireAdmin();
  try {
    const file = fd.get("file");
    let text = String(fd.get("csv") ?? "");
    if (file instanceof File && file.size > 0) {
      if (file.size > 1024 * 1024) throw new AppError("admin.csvTooLarge");
      text = await file.text();
    }
    const lines = text.replace(/^﻿/, "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let created = 0;
    let skipped = 0;
    for (const [i, line] of lines.entries()) {
      const cols = line.split(/[;,]/).map((c) => c.trim().replace(/^"|"$/g, ""));
      if (i === 0 && /name/i.test(cols[0]) && /mail/i.test(cols[1] ?? "")) continue; // header
      const parsed = UserInput.safeParse({ name: cols[0], email: cols[1], apartment: cols[2], role: (cols[3] || "RESIDENT").toUpperCase(), locale: cols[4] || "de" });
      if (!parsed.success || (await prisma.user.findUnique({ where: { email: parsed.data.email } }))) {
        skipped++;
        continue;
      }
      const u = await prisma.user.create({ data: { ...parsed.data, locale: isLocale(parsed.data.locale) ? parsed.data.locale : "de", status: "INVITED" } });
      await sendInvitation(u);
      created++;
    }
    await audit("user.imported", { actorId: admin.id, details: { created, skipped } });
    return { ok: true, message: "usersImported", params: { created, skipped } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function updateUserAction(userId: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { user: admin } = await requireAdmin();
  try {
    const parsed = UserInput.safeParse(Object.fromEntries(fd));
    if (!parsed.success) throw new AppError("admin.invalidUser");
    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target || target.status === "DELETED") throw new AppError("notFound");
    const { name, email, apartment, role } = parsed.data;
    if (email !== target.email && (await prisma.user.findUnique({ where: { email } }))) throw new AppError("admin.emailExists");
    // A-09: the last admin cannot lose admin rights.
    if (target.role === "ADMIN" && role !== "ADMIN") {
      const admins = await prisma.user.count({ where: { role: "ADMIN", status: { in: ["ACTIVE", "INVITED"] } } });
      if (admins <= 1) throw new AppError("admin.lastAdmin");
    }
    await prisma.user.update({ where: { id: userId }, data: { name, email, apartment, role: role as Role } });
    if (role !== target.role) {
      await destroyAllSessions(userId);
      await audit("user.roleChanged", { actorId: admin.id, entityType: "User", entityId: userId, details: { from: target.role, to: role } });
    }
    await audit("user.updated", { actorId: admin.id, entityType: "User", entityId: userId });
    return { ok: true, message: "saved" };
  } catch (e) {
    return toActionError(e);
  }
}

export async function resendInvitationAction(userId: string, _: ActionResult | null): Promise<ActionResult> {
  const { user: admin } = await requireAdmin();
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target || target.status !== "INVITED") return { ok: false, error: "admin.notInvited" };
  await sendInvitation(target);
  await audit("user.invitationResent", { actorId: admin.id, entityType: "User", entityId: userId });
  return { ok: true, message: "invitationSent" };
}

/** R-06: locking ends all sessions immediately. */
export async function setLockedAction(userId: string, locked: boolean, _: ActionResult | null): Promise<ActionResult> {
  const { user: admin } = await requireAdmin();
  try {
    if (userId === admin.id) throw new AppError("admin.notSelf");
    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target || target.status === "DELETED") throw new AppError("notFound");
    if (locked && target.role === "ADMIN") {
      const admins = await prisma.user.count({ where: { role: "ADMIN", status: "ACTIVE", id: { not: userId } } });
      if (admins < 1) throw new AppError("admin.lastAdmin");
    }
    await prisma.user.update({
      where: { id: userId },
      data: { status: locked ? "LOCKED" : target.passwordHash ? "ACTIVE" : "INVITED" },
    });
    if (locked) await destroyAllSessions(userId);
    await audit(locked ? "user.locked" : "user.unlocked", { actorId: admin.id, entityType: "User", entityId: userId });
    return { ok: true, message: locked ? "userLocked" : "userUnlocked" };
  } catch (e) {
    return toActionError(e);
  }
}

/** R-09 / S-08: deletion = anonymisation; bookings stay for accounting. Requires no open bookings and no spots. */
export async function deleteUserAction(userId: string, _: ActionResult | null): Promise<ActionResult> {
  const { user: admin } = await requireAdmin();
  try {
    if (userId === admin.id) throw new AppError("admin.notSelf");
    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target || target.status === "DELETED") throw new AppError("notFound");
    if (target.role === "ADMIN") {
      const admins = await prisma.user.count({ where: { role: "ADMIN", status: "ACTIVE", id: { not: userId } } });
      if (admins < 1) throw new AppError("admin.lastAdmin");
    }
    if ((await openBookingCount(userId)) > 0) throw new AppError("admin.openBookings");
    if ((await prisma.parkingSpot.count({ where: { ownerId: userId } })) > 0) throw new AppError("admin.ownsSpots");
    await prisma.$transaction([
      prisma.session.deleteMany({ where: { userId } }),
      prisma.token.deleteMany({ where: { userId } }),
      prisma.pushSubscription.deleteMany({ where: { userId } }),
      prisma.user.update({
        where: { id: userId },
        data: {
          status: "DELETED",
          email: `deleted-${userId}@invalid`,
          name: "Gelöschtes Konto",
          phone: null,
          apartment: "–",
          passwordHash: null,
          totpSecret: null,
          totpEnabled: false,
          notificationPrefs: {},
          deletionRequestedAt: null,
          role: "RESIDENT",
        },
      }),
    ]);
    await audit("user.deleted", { actorId: admin.id, entityType: "User", entityId: userId });
    return { ok: true, message: "userDeleted", redirect: "/admin/users" };
  } catch (e) {
    return toActionError(e);
  }
}

/** A-02 / P-01 */
export async function saveSpotAction(spotId: string | null, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { user: admin } = await requireAdmin();
  try {
    const planNumber = String(fd.get("planNumber") ?? "").trim();
    const label = String(fd.get("label") ?? "").trim();
    const type = String(fd.get("type") ?? "STANDARD") as SpotType;
    const ownerId = String(fd.get("ownerId") ?? "") || null;
    if (!/^[A-Za-z0-9_-]{1,20}$/.test(planNumber)) throw new AppError("admin.planNumber");
    if (label.length < 1 || label.length > 60) throw new AppError("admin.label");
    if (!SPOT_TYPES.includes(type)) throw new AppError("admin.spotType");
    if (ownerId) {
      const owner = await prisma.user.findUnique({ where: { id: ownerId } });
      if (!owner || owner.status === "DELETED") throw new AppError("admin.ownerInvalid");
    }
    const dup = await prisma.parkingSpot.findUnique({ where: { planNumber } });
    if (dup && dup.id !== spotId) throw new AppError("admin.planNumberExists");
    if (spotId) {
      const before = await prisma.parkingSpot.findUniqueOrThrow({ where: { id: spotId } });
      const ownerChanged = before.ownerId !== ownerId;
      await prisma.parkingSpot.update({
        where: { id: spotId },
        data: {
          planNumber, label, type, ownerId,
          // New owner starts fresh: own prices and availability (P-03).
          ...(ownerChanged ? { pricePerHourCents: 0, pricePerDayCents: 0, accessNotes: "", instantBooking: false, paused: true } : {}),
        },
      });
      if (ownerChanged) {
        await prisma.availabilityRule.deleteMany({ where: { spotId } });
        await audit("spot.ownerChanged", { actorId: admin.id, entityType: "ParkingSpot", entityId: spotId, details: { from: before.ownerId, to: ownerId } });
      }
      await audit("spot.adminUpdated", { actorId: admin.id, entityType: "ParkingSpot", entityId: spotId });
      return { ok: true, message: ownerChanged ? "spotOwnerChanged" : "saved" };
    }
    const spot = await prisma.parkingSpot.create({ data: { planNumber, label, type, ownerId } });
    await audit("spot.created", { actorId: admin.id, entityType: "ParkingSpot", entityId: spot.id });
    return { ok: true, message: "spotCreated" };
  } catch (e) {
    return toActionError(e);
  }
}

export async function deleteSpotAction(spotId: string, _: ActionResult | null): Promise<ActionResult> {
  const { user: admin } = await requireAdmin();
  try {
    const open = await prisma.booking.count({ where: { spotId, status: { in: ["DRAFT", "REQUESTED", "CONFIRMED"] }, endsAt: { gt: now() } } });
    if (open) throw new AppError("admin.spotHasBookings");
    const any = await prisma.booking.count({ where: { spotId } });
    if (any) {
      // Keep history: detach owner and pause instead of deleting rows referenced by bookings.
      throw new AppError("admin.spotHasHistory");
    }
    await prisma.parkingSpot.delete({ where: { id: spotId } });
    await audit("spot.deleted", { actorId: admin.id, entityType: "ParkingSpot", entityId: spotId });
    return { ok: true, message: "spotDeleted", redirect: "/admin/spots" };
  } catch (e) {
    return toActionError(e);
  }
}

/**
 * K-01 / A-03: an SVG file is the plan of one level (the name comes from the form); a Draw.io
 * file contains all levels and is converted. Uploading a level again replaces its plan.
 */
export async function uploadPlanAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { user: admin } = await requireAdmin();
  try {
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) throw new AppError("admin.planMissing");
    if (file.size > 2 * 1024 * 1024) throw new AppError("admin.svg.tooLarge");
    const text = await file.text();
    let levels: { name: string; svg: string }[];
    try {
      if (looksLikeDrawio(text)) {
        levels = drawioToLevels(text);
      } else {
        const name = String(fd.get("level") ?? "").trim();
        if (name.length < 1 || name.length > 30) throw new AppError("admin.levelName");
        levels = [{ name, svg: text }];
      }
      levels = levels.map((l) => ({ name: l.name.slice(0, 30), svg: sanitizeSvg(l.svg).svg }));
    } catch (e) {
      if (e instanceof DrawioError) throw new AppError(`admin.drawio.${e.message}`);
      if (e instanceof SvgError) throw new AppError(`admin.svg.${e.message}`);
      throw e;
    }
    for (const l of levels) await savePlanLevel(l.name, l.svg, admin.id);
    const report = await checkPlan();
    const names = levels.map((l) => l.name).join(", ");
    await audit("plan.uploaded", { actorId: admin.id, details: { levels: names, ...report } });
    return { ok: true, message: "planUploaded", params: { levels: names, missing: report.spotsWithoutArea.length, extra: report.areasWithoutSpot.length } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function deletePlanLevelAction(planId: string, _: ActionResult | null): Promise<ActionResult> {
  const { user: admin } = await requireAdmin();
  try {
    const plan = await prisma.garagePlan.delete({ where: { id: planId } });
    await audit("plan.deleted", { actorId: admin.id, details: { level: plan.name } });
    return { ok: true, message: "planDeleted", params: { level: plan.name } };
  } catch (e) {
    return toActionError(e);
  }
}

/** A-02: creates a spot (without owner) for every plan area that has none yet. */
export async function createMissingSpotsAction(_: ActionResult | null): Promise<ActionResult> {
  const { user: admin } = await requireAdmin();
  try {
    const levels = await loadPlanLevels();
    const existing = new Set((await prisma.parkingSpot.findMany({ select: { planNumber: true } })).map((s) => s.planNumber));
    const data: { planNumber: string; label: string }[] = [];
    const label = admin.locale === "en" ? "Parking spot" : "Stellplatz";
    for (const level of levels) {
      for (const id of level.areaIds) {
        if (existing.has(id) || !looksLikePlanNumber(id) || !/^[A-Za-z0-9_-]{1,20}$/.test(id)) continue;
        existing.add(id);
        data.push({ planNumber: id, label });
      }
    }
    const created = await prisma.parkingSpot.createMany({ data, skipDuplicates: true });
    await audit("spot.createdFromPlan", { actorId: admin.id, details: { count: created.count, planNumbers: data.map((d) => d.planNumber).join(", ") } });
    return { ok: true, message: "spotsCreated", params: { count: created.count } };
  } catch (e) {
    return toActionError(e);
  }
}

const SettingsInput = z.object({
  tier1Hours: z.coerce.number().int(),
  tier2Days: z.coerce.number().int(),
  tier3Months: z.coerce.number().int(),
  maxDurationValue: z.coerce.number().int(),
  maxDurationUnit: z.enum(["DAY", "MONTH"]),
  minLeadMinutes: z.coerce.number().int(),
  minDurationMinutes: z.coerce.number().int(),
  fairnessLimit: z.coerce.number().int(),
  openRequestLimit: z.coerce.number().int(),
  requestExpiryHours: z.coerce.number().int(),
});

/** A-04: all horizon and time rules. T-15: existing bookings stay untouched. */
export async function saveSettingsAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { user: admin } = await requireAdmin();
  try {
    const p = SettingsInput.safeParse(Object.fromEntries(fd));
    if (!p.success) throw new AppError("admin.settingsInvalid");
    const v = p.data;
    const R = SETTINGS_RANGES;
    const tier1Minutes = v.tier1Hours * 60;
    const within = (x: number, r: { min: number; max: number }) => x >= r.min && x <= r.max;
    const checks: [boolean, string][] = [
      [within(tier1Minutes, R.tier1Minutes), "tier1"],
      [within(v.tier2Days, R.tier2Days), "tier2"],
      [within(v.tier3Months, R.tier3Months), "tier3"],
      [within(v.maxDurationValue, v.maxDurationUnit === "DAY" ? R.maxDurationDays : R.maxDurationMonths), "maxDuration"],
      [within(v.minLeadMinutes, R.minLeadMinutes), "minLead"],
      [within(v.minDurationMinutes, R.minDurationMinutes) && v.minDurationMinutes % 15 === 0, "minDuration"],
      [within(v.fairnessLimit, R.fairnessLimit), "fairness"],
      [within(v.openRequestLimit, R.openRequestLimit), "openRequests"],
      [within(v.requestExpiryHours, R.requestExpiryHours), "expiry"],
    ];
    const bad = checks.find(([ok]) => !ok);
    if (bad) throw new AppError("admin.settingOutOfRange", { field: bad[1] });
    const data = {
      tier1Minutes, tier2Days: v.tier2Days, tier3Months: v.tier3Months, maxDurationValue: v.maxDurationValue, maxDurationUnit: v.maxDurationUnit,
      minLeadMinutes: v.minLeadMinutes, minDurationMinutes: v.minDurationMinutes, fairnessLimit: v.fairnessLimit, openRequestLimit: v.openRequestLimit,
      requestExpiryHours: v.requestExpiryHours,
    };
    await prisma.settings.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
    // T-05: per-spot values may never exceed the global ones.
    await prisma.parkingSpot.updateMany({ where: { tier1Minutes: { gt: tier1Minutes } }, data: { tier1Minutes } });
    await prisma.parkingSpot.updateMany({ where: { tier2Days: { gt: v.tier2Days } }, data: { tier2Days: v.tier2Days } });
    await prisma.parkingSpot.updateMany({ where: { tier3Months: { gt: v.tier3Months } }, data: { tier3Months: v.tier3Months } });
    await audit("settings.updated", { actorId: admin.id, details: data });
    return { ok: true, message: "saved" };
  } catch (e) {
    return toActionError(e);
  }
}

/** V-01: a new version of the single standard contract. */
export async function saveContractTemplateAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { user: admin } = await requireAdmin();
  const bodyDe = String(fd.get("bodyDe") ?? "").trim();
  const bodyEn = String(fd.get("bodyEn") ?? "").trim();
  if (bodyDe.length < 20 || bodyEn.length < 20) return { ok: false, error: "admin.templateTooShort" };
  const last = await prisma.contractTemplate.findFirst({ orderBy: { version: "desc" } });
  if (last && last.bodyDe === bodyDe && last.bodyEn === bodyEn) return { ok: true, message: "unchanged" };
  const version = (last?.version ?? 0) + 1;
  await prisma.contractTemplate.create({ data: { version, bodyDe, bodyEn, createdBy: admin.id } });
  await audit("contract.templateUpdated", { actorId: admin.id, details: { version } });
  return { ok: true, message: "templateSaved", params: { version } };
}

/** A-05 */
export async function saveLegalPageAction(key: "imprint" | "privacy", _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { user: admin } = await requireAdmin();
  const bodyDe = String(fd.get("bodyDe") ?? "");
  const bodyEn = String(fd.get("bodyEn") ?? "");
  await prisma.legalPage.upsert({ where: { key }, create: { key, bodyDe, bodyEn }, update: { bodyDe, bodyEn } });
  await audit("legal.updated", { actorId: admin.id, details: { key } });
  return { ok: true, message: "saved" };
}

/** A-07 */
export async function resolveProblemAction(reportId: string, _: ActionResult | null): Promise<ActionResult> {
  const { user: admin } = await requireAdmin();
  await prisma.problemReport.update({ where: { id: reportId }, data: { resolvedAt: now(), resolvedById: admin.id } });
  await audit("problem.resolved", { actorId: admin.id, entityType: "ProblemReport", entityId: reportId });
  return { ok: true, message: "problemResolved" };
}
