"use server";

import { getUser } from "@/lib/auth";
import { consumeToken, peekToken } from "@/lib/tokens";
import { AppError, toActionError, type ActionResult } from "@/lib/errors";
import { confirmBooking, declineBooking } from "@/lib/booking/service";
import { audit } from "@/lib/audit";

/** N-02: one-click confirm/decline from the e-mail (signed, single-use, requires login). */
export async function emailDecisionAction(token: string, _: ActionResult | null): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: "auth.loginRequired" };
  try {
    const rec = await peekToken(token, "ACTION");
    if (!rec || rec.userId !== user.id) throw new AppError("auth.tokenInvalid");
    const payload = rec.payload as { bookingId: string; action: "confirm" | "decline" };
    const used = await consumeToken(token, "ACTION");
    if (!used) throw new AppError("auth.tokenInvalid");
    if (payload.action === "confirm") await confirmBooking(payload.bookingId, user.id);
    else await declineBooking(payload.bookingId, user.id);
    await audit("booking.emailAction", { actorId: user.id, entityType: "Booking", entityId: payload.bookingId, details: { action: payload.action } });
    return { ok: true, message: payload.action === "confirm" ? "bookingConfirmed" : "bookingDeclined", redirect: `/bookings/${payload.bookingId}` };
  } catch (e) {
    return toActionError(e);
  }
}
