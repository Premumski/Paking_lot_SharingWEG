import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Session, User } from "@prisma/client";
import { prisma } from "./db";
import { env } from "./env";
import { ipPrefixHash, randomToken, sha256 } from "./crypto";
import { now } from "./clock";
import { DAY } from "./domain/time";

const IDLE_MS = 14 * DAY;
const ABSOLUTE_MS = 30 * DAY;

export function sessionCookieName() {
  return env.secure ? "__Host-sps" : "sps";
}

export async function clientInfo() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  const ua = h.get("user-agent")?.slice(0, 200) ?? null;
  return { ip, ua, ipHash: ipPrefixHash(ip) };
}

export async function createSession(userId: string, mfaVerified: boolean) {
  const token = randomToken();
  const { ua, ipHash } = await clientInfo();
  const t = now();
  await prisma.session.create({
    data: {
      tokenHash: sha256(token),
      userId,
      mfaVerified,
      userAgent: ua,
      ipPrefix: ipHash,
      createdAt: t,
      lastSeenAt: t,
      expiresAt: new Date(t.getTime() + IDLE_MS),
    },
  });
  const jar = await cookies();
  // S-02: HttpOnly, Secure (under HTTPS), SameSite=Lax
  jar.set(sessionCookieName(), token, {
    httpOnly: true,
    secure: env.secure,
    sameSite: "lax",
    path: "/",
    maxAge: ABSOLUTE_MS / 1000,
  });
}

export type AuthContext = { session: Session; user: User };

/** Loads the current session once per request. Locked or deleted users have no session (R-06). */
export const getAuth = cache(async (): Promise<AuthContext | null> => {
  const jar = await cookies();
  const token = jar.get(sessionCookieName())?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!session) return null;
  const t = now();
  if (session.expiresAt < t || t.getTime() - session.createdAt.getTime() > ABSOLUTE_MS || session.user.status !== "ACTIVE") {
    await prisma.session.deleteMany({ where: { id: session.id } });
    return null;
  }
  if (t.getTime() - session.lastSeenAt.getTime() > 5 * 60_000) {
    await prisma.session.update({
      where: { id: session.id },
      data: { lastSeenAt: t, expiresAt: new Date(t.getTime() + IDLE_MS) },
    });
  }
  const { user, ...rest } = session;
  return { session: rest, user };
});

export async function getUser(): Promise<User | null> {
  const a = await getAuth();
  return a && a.session.mfaVerified ? a.user : null;
}

function mustEnrollTotp(user: User) {
  return user.role === "ADMIN" && !user.totpEnabled;
}

/** Use in pages and actions. Redirects to login / 2FA / TOTP enrollment as needed (R-04). */
export async function requireUser(): Promise<AuthContext> {
  const a = await getAuth();
  if (!a) redirect("/login");
  if (!a.session.mfaVerified) {
    if (mustEnrollTotp(a.user)) redirect("/setup-2fa");
    redirect("/login/2fa");
  }
  // R-04: an account promoted to admin must enrol TOTP before continuing.
  if (mustEnrollTotp(a.user)) redirect("/setup-2fa");
  return a;
}

export async function requireAdmin(): Promise<AuthContext> {
  const a = await requireUser();
  if (a.user.role !== "ADMIN") redirect("/");
  return a;
}

export async function destroyCurrentSession() {
  const jar = await cookies();
  const token = jar.get(sessionCookieName())?.value;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
  jar.delete(sessionCookieName());
}

export async function markSessionVerified(sessionId: string) {
  await prisma.session.update({ where: { id: sessionId }, data: { mfaVerified: true } });
}

/** R-06: ends every session of a user immediately. */
export async function destroyAllSessions(userId: string, exceptSessionId?: string) {
  await prisma.session.deleteMany({ where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) } });
}
