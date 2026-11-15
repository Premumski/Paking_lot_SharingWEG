"use server";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AppError, toActionError, type ActionResult } from "@/lib/errors";
import { parseLocal } from "@/lib/domain/time";
import { quoteBooking, type Quote } from "@/lib/booking/quote";
import {
  cancelBooking,
  confirmBooking,
  createRequest,
  declineBooking,
  startPaymentRetry,
  withdrawBooking,
} from "@/lib/booking/service";
import { contractVars, renderContractText } from "@/lib/contracts";
import { audit } from "@/lib/audit";
import { notify, notifyAdmins } from "@/lib/notify";
import { formatDateTime } from "@/i18n/server";
import { now } from "@/lib/clock";

function readPeriod(fd: FormData) {
  const start = parseLocal(String(fd.get("fromDate") ?? ""), String(fd.get("fromTime") ?? ""));
  const end = parseLocal(String(fd.get("toDate") ?? ""), String(fd.get("toTime") ?? ""));
  if (!start || !end) throw new AppError("booking.horizon.invalidRange");
  return { start, end };
}

/** Live preview: price, instant confirmation and horizon (T-14, B-01, B-02). */
export async function quoteAction(input: {
  spotId: string;
  fromDate: string;
  fromTime: string;
  toDate: string;
  toTime: string;
  extendsBookingId?: string;
}): Promise<{ quote: Quote | null; contract: string | null }> {
  const { user } = await requireUser();
  const start = parseLocal(input.fromDate, input.fromTime);
  const end = parseLocal(input.toDate, input.toTime);
  if (!start || !end) return { quote: null, contract: null };
  const { quote, spot } = await quoteBooking({ tenant: user, spotId: input.spotId, start, end, extendsBookingId: input.extendsBookingId });
  let contract: string | null = null;
  if (spot?.owner) {
    const rendered = await renderContractText(
      contractVars({ id: "—", startsAt: start, endsAt: end, priceCents: quote.priceCents, visitorName: null, licensePlate: null }, spot, spot.owner, user, user.locale),
      user.locale,
    );
    contract = rendered?.text ?? null;
  }
  return { quote, contract };
}

export async function requestAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { user } = await requireUser();
  try {
    const { start, end } = readPeriod(fd);
    const res = await createRequest(user, {
      spotId: String(fd.get("spotId")),
      start,
      end,
      visitorName: String(fd.get("visitorName") ?? ""),
      licensePlate: String(fd.get("licensePlate") ?? ""),
      acceptContract: fd.get("acceptContract") === "on",
      extendsBookingId: (fd.get("extendsBookingId") as string) || null,
    });
    return { ok: true, redirect: res.redirect ?? `/bookings/${res.bookingId}?created=1` };
  } catch (e) {
    return toActionError(e);
  }
}

export async function confirmAction(bookingId: string, _: ActionResult | null): Promise<ActionResult> {
  const { user } = await requireUser();
  try {
    await confirmBooking(bookingId, user.id);
    return { ok: true, message: "bookingConfirmed" };
  } catch (e) {
    return toActionError(e);
  }
}

export async function declineAction(bookingId: string, _: ActionResult | null): Promise<ActionResult> {
  const { user } = await requireUser();
  try {
    await declineBooking(bookingId, user.id);
    return { ok: true, message: "bookingDeclined" };
  } catch (e) {
    return toActionError(e);
  }
}

export async function withdrawAction(bookingId: string, _: ActionResult | null): Promise<ActionResult> {
  const { user } = await requireUser();
  try {
    await withdrawBooking(bookingId, user.id);
    return { ok: true, message: "bookingWithdrawn" };
  } catch (e) {
    return toActionError(e);
  }
}

export async function cancelAction(bookingId: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { user } = await requireUser();
  try {
    const b = await prisma.booking.findUnique({ where: { id: bookingId }, include: { spot: true } });
    if (!b) throw new AppError("notFound");
    const as = b.tenantId === user.id ? "TENANT" : b.spot.ownerId === user.id ? "OWNER" : null;
    if (!as) throw new AppError("forbidden");
    await cancelBooking(bookingId, { userId: user.id, as }, String(fd.get("reason") ?? ""));
    return { ok: true, message: "bookingCancelled" };
  } catch (e) {
    return toActionError(e);
  }
}

export async function retryPaymentAction(bookingId: string, _: ActionResult | null): Promise<ActionResult> {
  const { user } = await requireUser();
  try {
    const url = await startPaymentRetry(bookingId, user.id);
    return { ok: true, redirect: url };
  } catch (e) {
    return toActionError(e);
  }
}

/** Continue an abandoned payment-method step of a draft request. */
export async function resumeDraftAction(bookingId: string, _: ActionResult | null): Promise<ActionResult> {
  const { user } = await requireUser();
  try {
    const b = await prisma.booking.findUnique({ where: { id: bookingId }, include: { tenant: true } });
    if (!b || b.tenantId !== user.id) throw new AppError("forbidden");
    if (b.status !== "DRAFT") throw new AppError("booking.notPending");
    const owner = await prisma.user.findUniqueOrThrow({ where: { id: b.ownerId } });
    const { paymentAdapter } = await import("@/lib/payments");
    const url = await paymentAdapter().startMethodCollection({ booking: b, tenant: user, owner, locale: user.locale });
    return { ok: true, redirect: url };
  } catch (e) {
    return toActionError(e);
  }
}

const PHOTO_TYPES: Record<string, number[]> = {
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/png": [0x89, 0x50, 0x4e, 0x47],
  "image/webp": [0x52, 0x49, 0x46, 0x46],
};

/** D-02: problem report with text and up to 3 photos, to the counterpart and the admins. */
export async function reportProblemAction(bookingId: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { user } = await requireUser();
  try {
    const b = await prisma.booking.findUnique({ where: { id: bookingId }, include: { spot: true } });
    if (!b || (b.tenantId !== user.id && b.ownerId !== user.id)) throw new AppError("forbidden");
    if (b.status !== "CONFIRMED") throw new AppError("problem.onlyConfirmed");
    const category = String(fd.get("category"));
    if (!["SPOT_OCCUPIED", "OVERSTAY", "DAMAGE", "OTHER"].includes(category)) throw new AppError("problem.category");
    const text = String(fd.get("text") ?? "").trim();
    if (text.length < 5 || text.length > 2000) throw new AppError("problem.text");
    const files = fd.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length > 3) throw new AppError("problem.tooManyPhotos");
    const photos: { mime: string; data: Uint8Array<ArrayBuffer> }[] = [];
    for (const f of files) {
      if (f.size > 5 * 1024 * 1024) throw new AppError("problem.photoTooLarge");
      const buf = Buffer.from(await f.arrayBuffer());
      const mime = Object.entries(PHOTO_TYPES).find(([, magic]) => magic.every((byte, i) => buf[i] === byte))?.[0];
      if (!mime) throw new AppError("problem.photoType");
      photos.push({ mime, data: new Uint8Array(buf) });
    }
    const report = await prisma.problemReport.create({
      data: {
        bookingId: b.id,
        reporterId: user.id,
        category: category as "SPOT_OCCUPIED" | "OVERSTAY" | "DAMAGE" | "OTHER",
        text,
        createdAt: now(),
        photos: { create: photos },
      },
    });
    await audit("problem.reported", { actorId: user.id, entityType: "ProblemReport", entityId: report.id, details: { bookingId: b.id, category } });
    const counterpart = b.tenantId === user.id ? b.ownerId : b.tenantId;
    const vars = (l: string) => ({ spot: b.spot.planNumber, start: formatDateTime(b.startsAt, l), reporter: user.name });
    await notify(counterpart, "problemReported", vars, { path: `/bookings/${b.id}`, extra: () => text });
    await notifyAdmins("problemReported", vars, { path: `/admin/problems`, extra: () => text }, [user.id, counterpart]);
    return { ok: true, message: "problemReported" };
  } catch (e) {
    return toActionError(e);
  }
}
