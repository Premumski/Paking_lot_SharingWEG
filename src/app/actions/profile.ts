"use server";

import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { now } from "@/lib/clock";
import { env } from "@/lib/env";
import { AppError, toActionError, type ActionResult } from "@/lib/errors";
import { NOTIFICATION_TYPES, type NotificationPrefs, alertAdmins } from "@/lib/notify";
import { isLocale, LOCALE_COOKIE } from "@/i18n/config";

/** R-08: name, phone, language and notifications are self-service; e-mail and apartment are admin-only. */
export async function updateProfileAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { user } = await requireUser();
  try {
    const name = String(fd.get("name") ?? "").trim();
    const phone = String(fd.get("phone") ?? "").trim();
    const locale = String(fd.get("locale") ?? "de");
    if (name.length < 2 || name.length > 80) throw new AppError("profile.name");
    if (phone && !/^[+0-9 ()/-]{5,25}$/.test(phone)) throw new AppError("profile.phone");
    if (!isLocale(locale)) throw new AppError("profile.locale");
    await prisma.user.update({ where: { id: user.id }, data: { name, phone: phone || null, locale } });
    (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", sameSite: "lax", secure: env.secure, maxAge: 365 * 24 * 3600 });
    await audit("profile.updated", { actorId: user.id, entityType: "User", entityId: user.id });
    return { ok: true, message: "saved" };
  } catch (e) {
    return toActionError(e);
  }
}

/** N-03: each notification type per channel. */
export async function updateNotificationsAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { user } = await requireUser();
  const prefs: NotificationPrefs = {};
  for (const type of NOTIFICATION_TYPES) {
    prefs[type] = { email: fd.get(`${type}.email`) === "on", push: fd.get(`${type}.push`) === "on" };
  }
  await prisma.user.update({ where: { id: user.id }, data: { notificationPrefs: prefs } });
  return { ok: true, message: "saved" };
}

/** R-07 */
export async function revokeSessionAction(sessionId: string, _: ActionResult | null): Promise<ActionResult> {
  const { user, session } = await requireUser();
  if (sessionId === session.id) return { ok: false, error: "profile.currentSession" };
  await prisma.session.deleteMany({ where: { id: sessionId, userId: user.id } });
  await audit("auth.sessionRevoked", { actorId: user.id, entityType: "User", entityId: user.id });
  return { ok: true, message: "sessionRevoked" };
}

export async function revokeOtherSessionsAction(_: ActionResult | null): Promise<ActionResult> {
  const { user, session } = await requireUser();
  await prisma.session.deleteMany({ where: { userId: user.id, id: { not: session.id } } });
  await audit("auth.sessionsRevoked", { actorId: user.id, entityType: "User", entityId: user.id });
  return { ok: true, message: "sessionRevoked" };
}

/** R-09: deletion request; the admin executes it. */
export async function requestDeletionAction(_: ActionResult | null): Promise<ActionResult> {
  const { user } = await requireUser();
  await prisma.user.update({ where: { id: user.id }, data: { deletionRequestedAt: now() } });
  await audit("user.deletionRequested", { actorId: user.id, entityType: "User", entityId: user.id });
  await alertAdmins("deletionRequested", { name: user.name }, "/admin/users");
  return { ok: true, message: "deletionRequested" };
}

export async function withdrawDeletionAction(_: ActionResult | null): Promise<ActionResult> {
  const { user } = await requireUser();
  await prisma.user.update({ where: { id: user.id }, data: { deletionRequestedAt: null } });
  await audit("user.deletionWithdrawn", { actorId: user.id, entityType: "User", entityId: user.id });
  return { ok: true, message: "saved" };
}
