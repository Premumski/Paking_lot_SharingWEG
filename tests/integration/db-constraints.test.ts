import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

const url = process.env.TEST_DATABASE_URL;
const prisma = url ? new PrismaClient({ datasources: { db: { url } } }) : (null as unknown as PrismaClient);
const d = (s: string) => new Date(s);

describe.skipIf(!url)("database guarantees", () => {
  let spotId = "";
  let tenantId = "";
  let ownerId = "";

  beforeAll(async () => {
    await prisma.$executeRawUnsafe(`TRUNCATE "Booking","ParkingSpot","User","AuditLog","Contract" CASCADE`);
    const owner = await prisma.user.create({ data: { email: "o@test", name: "O", apartment: "1" } });
    const tenant = await prisma.user.create({ data: { email: "t@test", name: "T", apartment: "2" } });
    const spot = await prisma.parkingSpot.create({ data: { planNumber: "X1", label: "x", ownerId: owner.id } });
    [spotId, tenantId, ownerId] = [spot.id, tenant.id, owner.id];
  });
  afterAll(async () => prisma.$disconnect());

  const booking = (start: string, end: string, status: "CONFIRMED" | "REQUESTED") =>
    prisma.booking.create({ data: { spotId, tenantId, ownerId, startsAt: d(start), endsAt: d(end), priceCents: 0, status } });

  it("T-18: overlapping confirmed bookings are rejected by an exclusion constraint", async () => {
    await booking("2030-01-01T10:00:00Z", "2030-01-01T12:00:00Z", "CONFIRMED");
    await expect(booking("2030-01-01T11:00:00Z", "2030-01-01T13:00:00Z", "CONFIRMED")).rejects.toThrow(/Booking_no_overlap|23P01|exclusion/i);
  });

  it("allows adjacent confirmed bookings and overlapping requests (B-04)", async () => {
    await expect(booking("2030-01-01T12:00:00Z", "2030-01-01T13:00:00Z", "CONFIRMED")).resolves.toBeTruthy();
    await expect(booking("2030-01-01T10:30:00Z", "2030-01-01T11:30:00Z", "REQUESTED")).resolves.toBeTruthy();
  });

  it("rejects confirming a request that overlaps (race-safe)", async () => {
    const r = await booking("2030-01-01T09:00:00Z", "2030-01-01T10:30:00Z", "REQUESTED");
    await expect(prisma.booking.update({ where: { id: r.id }, data: { status: "CONFIRMED" } })).rejects.toThrow();
  });

  it("A-08: audit log is append-only", async () => {
    const row = await prisma.auditLog.create({ data: { action: "test" } });
    await expect(prisma.auditLog.update({ where: { id: row.id }, data: { action: "changed" } })).rejects.toThrow(/append-only/);
    await expect(prisma.auditLog.delete({ where: { id: row.id } })).rejects.toThrow(/append-only/);
  });

  it("V-02: contracts are immutable", async () => {
    const b = await booking("2030-02-01T10:00:00Z", "2030-02-01T12:00:00Z", "CONFIRMED");
    const c = await prisma.contract.create({ data: { bookingId: b.id, version: 1, locale: "de", pdf: new Uint8Array([1, 2, 3]), sha256: "x" } });
    await expect(prisma.contract.update({ where: { id: c.id }, data: { sha256: "y" } })).rejects.toThrow(/immutable/);
  });
});
