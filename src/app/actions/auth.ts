"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { checkPasswordPolicy, hashPassword, verifyPassword } from "@/lib/passwords";
import { consume, hit, lockStatus, resetRateLimit } from "@/lib/ratelimit";
import {
  clientInfo,
  createSession,
  destroyAllSessions,
  destroyCurrentSession,
  getAuth,
  markSessionVerified,
} from "@/lib/auth";
import { consumeToken, issueToken, peekToken } from "@/lib/tokens";
import { verifyTotp } from "@/lib/totp";
import { sendMail } from "@/lib/mail";
import { env } from "@/lib/env";
import { translatorFor } from "@/i18n/server";
import { isLocale, LOCALE_COOKIE } from "@/i18n/config";
import type { ActionResult } from "@/lib/errors";
import { HOUR, MINUTE } from "@/lib/domain/time";

const LOGIN_WINDOW = 15 * MINUTE;

async function setLocaleCookie(locale: string) {
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", sameSite: "lax", secure: env.secure, maxAge: 365 * 24 * 3600 });
}

function safeNext(next: unknown): string {
  const n = typeof next === "string" ? next : "";
  return n.startsWith("/") && !n.startsWith("//") ? n : "/";
}

/** R-03 / S-03: e-mail + password, 5 attempts per 15 min per account and per IP, escalating lock. */
export async function loginAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  const next = safeNext(fd.get("next"));
  const { ipHash } = await clientInfo();
  // S-03: 5 failures per account+IP (escalating lock). Looser limits per IP (password spraying)
  // and per account (distributed guessing) avoid locking out neighbours behind a shared IP.
  const pairKey = `login:pair:${email}:${ipHash ?? "unknown"}`;
  const ipKey = `login:ip:${ipHash ?? "unknown"}`;
  const accountKey = `login:acct:${email}`;
  const locks = await Promise.all([lockStatus(pairKey), lockStatus(ipKey), lockStatus(accountKey)]);
  if (locks.some((l) => l.locked)) {
    const minutes = Math.ceil(Math.max(...locks.map((l) => l.retryAfterMs)) / MINUTE);
    return { ok: false, error: "auth.rateLimited", params: { minutes } };
  }
  const user = await prisma.user.findUnique({ where: { email } });
  const valid = await verifyPassword(user?.passwordHash, password);
  if (!user || !valid || user.status !== "ACTIVE") {
    await hit(pairKey, 5, LOGIN_WINDOW, { escalate: true });
    await hit(ipKey, 30, LOGIN_WINDOW, { escalate: true });
    await hit(accountKey, 20, LOGIN_WINDOW, { escalate: true });
    await audit("auth.loginFailed", { actorId: user?.id, entityType: "User", entityId: user?.id, details: { reason: !user ? "unknown" : user.status !== "ACTIVE" ? "status" : "password" } });
    // R-06: locked accounts get the same generic message.
    return { ok: false, error: "auth.invalidCredentials" };
  }
  await resetRateLimit(pairKey);
  await createSession(user.id, !user.totpEnabled && user.role !== "ADMIN");
  await setLocaleCookie(user.locale);
  await audit("auth.login", { actorId: user.id, entityType: "User", entityId: user.id, details: { mfa: user.totpEnabled } });
  if (user.totpEnabled) redirect(`/login/2fa?next=${encodeURIComponent(next)}`);
  if (user.role === "ADMIN") redirect("/setup-2fa"); // R-04: TOTP is mandatory for admins
  redirect(next);
}

export async function verifyTotpAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const auth = await getAuth();
  if (!auth || !auth.user.totpSecret) redirect("/login");
  const key = `totp:${auth.user.id}`;
  const rl = await lockStatus(key);
  if (rl.locked) return { ok: false, error: "auth.rateLimited", params: { minutes: Math.ceil(rl.retryAfterMs / MINUTE) } };
  if (!verifyTotp(auth.user.totpSecret, String(fd.get("code") ?? ""))) {
    await hit(key, 5, LOGIN_WINDOW, { escalate: true });
    await audit("auth.totpFailed", { actorId: auth.user.id, entityType: "User", entityId: auth.user.id });
    return { ok: false, error: "auth.invalidCode" };
  }
  await resetRateLimit(key);
  await markSessionVerified(auth.session.id);
  await audit("auth.totpVerified", { actorId: auth.user.id, entityType: "User", entityId: auth.user.id });
  redirect(safeNext(fd.get("next")));
}

export async function confirmTotpEnrollment(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  const jar = await cookies();
  const secret = String(fd.get("secret") ?? "");
  if (!secret || jar.get("totp_pending")?.value !== secret) return { ok: false, error: "auth.enrollmentExpired" };
  if (!verifyTotp(secret, String(fd.get("code") ?? ""))) return { ok: false, error: "auth.invalidCode" };
  // Users who already use 2FA must still be fully signed in to replace it.
  if (auth.user.totpEnabled && !auth.session.mfaVerified) redirect("/login/2fa");
  await prisma.user.update({ where: { id: auth.user.id }, data: { totpSecret: secret, totpEnabled: true } });
  await markSessionVerified(auth.session.id);
  await destroyAllSessions(auth.user.id, auth.session.id);
  jar.delete("totp_pending");
  await audit("auth.totpEnabled", { actorId: auth.user.id, entityType: "User", entityId: auth.user.id });
  return { ok: true, message: "totpEnabled", redirect: "/profile" };
}

export async function disableTotpAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const auth = await getAuth();
  if (!auth || !auth.session.mfaVerified) redirect("/login");
  if (auth.user.role === "ADMIN") return { ok: false, error: "auth.totpRequiredForAdmins" };
  if (!auth.user.totpSecret || !verifyTotp(auth.user.totpSecret, String(fd.get("code") ?? ""))) {
    return { ok: false, error: "auth.invalidCode" };
  }
  await prisma.user.update({ where: { id: auth.user.id }, data: { totpEnabled: false, totpSecret: null } });
  await audit("auth.totpDisabled", { actorId: auth.user.id, entityType: "User", entityId: auth.user.id });
  return { ok: true, message: "totpDisabled" };
}

export async function logoutAction() {
  const auth = await getAuth();
  await destroyCurrentSession();
  if (auth) await audit("auth.logout", { actorId: auth.user.id, entityType: "User", entityId: auth.user.id });
  redirect("/login");
}

/** R-05: never reveals whether the e-mail exists. Rate limit 3 per hour (S-03). */
export async function forgotPasswordAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const { ipHash } = await clientInfo();
  const rlA = await consume(`reset:acct:${email}`, 3, HOUR);
  const rlB = await consume(`reset:ip:${ipHash ?? "unknown"}`, 10, HOUR);
  if (rlA.allowed && rlB.allowed && z.string().email().safeParse(email).success) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user && user.status === "ACTIVE") {
      const token = await issueToken(user.id, "RESET", HOUR);
      const t = translatorFor(user.locale, "authMail");
      await sendMail({
        to: user.email,
        subject: t("resetSubject"),
        text: t("resetBody", { name: user.name, url: `${env.appUrl}/reset-password/${token}` }),
      });
      await audit("auth.resetRequested", { entityType: "User", entityId: user.id });
    }
  }
  return { ok: true, message: "resetSent" };
}

async function setPasswordWithToken(type: "RESET" | "INVITE", fd: FormData): Promise<ActionResult> {
  const token = String(fd.get("token") ?? "");
  const password = String(fd.get("password") ?? "");
  if (password !== String(fd.get("password2") ?? "")) return { ok: false, error: "auth.passwordMismatch" };
  const problem = await checkPasswordPolicy(password);
  if (problem) return { ok: false, error: `auth.password.${problem}` };
  const rec = await peekToken(token, type);
  if (!rec) return { ok: false, error: "auth.tokenInvalid" };
  const consumed = await consumeToken(token, type);
  if (!consumed) return { ok: false, error: "auth.tokenInvalid" };
  const user = consumed.user;
  if (type === "RESET" && user.status !== "ACTIVE") return { ok: false, error: "auth.tokenInvalid" };
  if (type === "INVITE" && user.status !== "INVITED") return { ok: false, error: "auth.tokenInvalid" };
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(password), status: "ACTIVE" },
  });
  await destroyAllSessions(user.id);
  await audit(type === "RESET" ? "auth.passwordReset" : "auth.invitationAccepted", { actorId: user.id, entityType: "User", entityId: user.id });
  return { ok: true, message: type === "RESET" ? "passwordReset" : "invitationAccepted", redirect: "/login?done=1" };
}

export async function resetPasswordAction(_: ActionResult | null, fd: FormData) {
  return setPasswordWithToken("RESET", fd);
}

/** R-02: invitation link, valid 72 h, single use. */
export async function acceptInvitationAction(_: ActionResult | null, fd: FormData) {
  return setPasswordWithToken("INVITE", fd);
}

export async function changePasswordAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const auth = await getAuth();
  if (!auth || !auth.session.mfaVerified) redirect("/login");
  const current = String(fd.get("current") ?? "");
  const password = String(fd.get("password") ?? "");
  if (password !== String(fd.get("password2") ?? "")) return { ok: false, error: "auth.passwordMismatch" };
  if (!(await verifyPassword(auth.user.passwordHash, current))) return { ok: false, error: "auth.wrongPassword" };
  const problem = await checkPasswordPolicy(password);
  if (problem) return { ok: false, error: `auth.password.${problem}` };
  await prisma.user.update({ where: { id: auth.user.id }, data: { passwordHash: await hashPassword(password) } });
  await destroyAllSessions(auth.user.id, auth.session.id);
  await audit("auth.passwordChanged", { actorId: auth.user.id, entityType: "User", entityId: auth.user.id });
  return { ok: true, message: "passwordChanged" };
}

export async function setLanguageAction(fd: FormData) {
  const locale = String(fd.get("locale") ?? "");
  if (!isLocale(locale)) return;
  await setLocaleCookie(locale);
  const auth = await getAuth();
  if (auth) await prisma.user.update({ where: { id: auth.user.id }, data: { locale } });
}
