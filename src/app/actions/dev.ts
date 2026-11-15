"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { getAuth, createSession } from "@/lib/auth";
import { setClockOffset } from "@/lib/clock";
import { runAllJobs } from "@/lib/jobs";
import { emitMockEvent } from "@/lib/payments/mock";
import type { ActionResult } from "@/lib/errors";
import { cookies } from "next/headers";
import { LOCALE_COOKIE } from "@/i18n/config";

function guard() {
  if (!env.devTools) throw new Error("DEV_TOOLS disabled");
}

async function guardUser() {
  guard();
  const a = await getAuth();
  if (!a) redirect("/login");
  return a;
}

/** Test mode only: one-click login as a seed account (skips password and TOTP). */
export async function devLoginAction(userId: string) {
  guard();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.status !== "ACTIVE") return;
  await createSession(user.id, true);
  (await cookies()).set(LOCALE_COOKIE, user.locale, { path: "/" });
  redirect("/");
}

export async function setClockAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await guardUser();
  const mode = String(fd.get("mode"));
  const current = Number((await prisma.settings.findUnique({ where: { id: 1 } }))?.devClockOffsetMs ?? 0);
  let next = current;
  if (mode === "reset") next = 0;
  else next = current + Number(fd.get("hours") ?? 0) * 3600_000;
  await prisma.settings.update({ where: { id: 1 }, data: { devClockOffsetMs: BigInt(Math.round(next)) } });
  setClockOffset(next);
  await runAllJobs();
  return { ok: true, message: "devClockSet" };
}

export async function runJobsAction(_: ActionResult | null): Promise<ActionResult> {
  await guardUser();
  await runAllJobs();
  return { ok: true, message: "devJobsRun" };
}

/** Simulates the SEPA outcome after "processing" (Z-07). */
export async function sepaOutcomeAction(paymentId: string, success: boolean, _: ActionResult | null): Promise<ActionResult> {
  await guardUser();
  await emitMockEvent(
    success
      ? { id: `evt_${randomUUID()}`, type: "payment_succeeded", paymentId, methodType: "sepa_debit" }
      : { id: `evt_${randomUUID()}`, type: "payment_failed", paymentId, failureCode: "insufficient_funds" },
  );
  return { ok: true, message: success ? "devSepaSucceeded" : "devSepaBounced" };
}

/** Mock hosted payment page: saves a test method (setup) or pays directly (retry). */
export async function mockPayAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { user } = await guardUser();
  if (env.paymentProvider !== "mock") return { ok: false, error: "unexpected" };
  const mode = String(fd.get("mode"));
  const method = String(fd.get("method"));
  if (!["card_ok", "card_fail", "sepa"].includes(method) && mode !== "onboarding") return { ok: false, error: "unexpected" };
  if (mode === "onboarding") {
    const accountRef = user.paymentAccountId ?? `acct_mock_${randomUUID().slice(0, 12)}`;
    await prisma.user.update({ where: { id: user.id }, data: { paymentAccountId: accountRef } });
    await emitMockEvent({ id: `evt_${randomUUID()}`, type: "account_updated", accountRef, chargesEnabled: true });
    return { ok: true, redirect: "/earnings?onboarding=done" };
  }
  const bookingId = String(fd.get("booking"));
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.tenantId !== user.id) return { ok: false, error: "forbidden" };
  if (mode === "setup") {
    await emitMockEvent({
      id: `evt_${randomUUID()}`,
      type: "method_saved",
      bookingId,
      paymentMethodRef: method,
      methodType: method === "sepa" ? "sepa_debit" : "card",
    });
    return { ok: true, redirect: `/bookings/${bookingId}?created=1` };
  }
  if (mode === "retry") {
    const paymentId = String(fd.get("payment"));
    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.bookingId !== bookingId) return { ok: false, error: "forbidden" };
    await prisma.booking.update({ where: { id: bookingId }, data: { paymentMethodRef: method, paymentMethodType: method === "sepa" ? "sepa_debit" : "card" } });
    const providerRef = `pi_mock_${randomUUID()}`;
    await prisma.payment.update({ where: { id: paymentId }, data: { providerRef } });
    await emitMockEvent(
      method === "card_fail"
        ? { id: `evt_${randomUUID()}`, type: "payment_failed", paymentId, failureCode: "card_declined" }
        : method === "sepa"
          ? { id: `evt_${randomUUID()}`, type: "payment_processing", paymentId }
          : { id: `evt_${randomUUID()}`, type: "payment_succeeded", paymentId, methodType: "card" },
    );
    return { ok: true, redirect: `/bookings/${bookingId}?checkout=done` };
  }
  return { ok: false, error: "unexpected" };
}
