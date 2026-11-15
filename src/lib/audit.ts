import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./db";
import { now } from "./clock";

type Tx = Prisma.TransactionClient | PrismaClient;

/** A-08: append-only audit log. Never put passwords, tokens or payment data into `details`. */
export async function audit(
  action: string,
  opts: { actorId?: string | null; entityType?: string; entityId?: string; details?: Prisma.InputJsonValue } = {},
  tx: Tx = prisma,
) {
  await tx.auditLog.create({
    data: {
      at: now(),
      action,
      actorId: opts.actorId ?? null,
      entityType: opts.entityType,
      entityId: opts.entityId,
      details: opts.details,
    },
  });
}
