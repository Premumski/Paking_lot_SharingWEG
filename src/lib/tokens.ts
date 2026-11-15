import type { Prisma, TokenType } from "@prisma/client";
import { prisma } from "./db";
import { randomToken, sha256 } from "./crypto";
import { now } from "./clock";

/** Single-use tokens (R-02 invitation, R-05 password reset, N-02 e-mail actions). Only hashes are stored. */
export async function issueToken(userId: string, type: TokenType, ttlMs: number, payload?: Prisma.InputJsonValue) {
  const token = randomToken();
  if (type !== "ACTION") {
    // Older invitation / reset links become invalid when a new one is issued.
    await prisma.token.updateMany({ where: { userId, type, usedAt: null }, data: { usedAt: now() } });
  }
  await prisma.token.create({
    data: { tokenHash: sha256(token), type, userId, payload, expiresAt: new Date(now().getTime() + ttlMs) },
  });
  return token;
}

export async function peekToken(token: string, type: TokenType) {
  const rec = await prisma.token.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!rec || rec.type !== type || rec.usedAt || rec.expiresAt < now()) return null;
  return rec;
}

/** Atomically marks the token as used; returns null if it was already used or expired. */
export async function consumeToken(token: string, type: TokenType) {
  const rec = await peekToken(token, type);
  if (!rec) return null;
  const res = await prisma.token.updateMany({ where: { id: rec.id, usedAt: null }, data: { usedAt: now() } });
  return res.count === 1 ? rec : null;
}
