import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { now } from "@/lib/clock";
import { formatDateTime } from "@/i18n/server";
import { estimatePayoutCents, formatEuro } from "@/lib/domain/pricing";
import { contactVisible, displayStatus } from "@/lib/booking/visibility";
import { localDateString, localTimeString, HOUR } from "@/lib/domain/time";
import { PaymentBadge, StatusBadge } from "@/components/StatusBadge";
import { ActionButton } from "@/components/ActionButton";
import {
  cancelAction,
  confirmAction,
  declineAction,
  reportProblemAction,
  resumeDraftAction,
  retryPaymentAction,
  withdrawAction,
} from "@/app/actions/bookings";
import { CancelForm, ProblemForm } from "./ClientForms";
import { RequestForm } from "../../spots/[id]/RequestForm";

export default async function BookingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string; checkout?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { user } = await requireUser();
  const t = await getTranslations("bookingDetail");
  const locale = await getLocale();
  const b = await prisma.booking.findUnique({
    where: { id },
    include: {
      spot: { include: { owner: true } },
      tenant: true,
      contracts: { select: { locale: true, version: true, createdAt: true, sha256: true } },
      problemReports: { include: { photos: { select: { id: true } }, reporter: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
      payments: { orderBy: { createdAt: "desc" } },
    },
  });
  // S-04: only tenant, owner and admins can see a booking.
  const isTenant = b?.tenantId === user.id;
  const isOwner = b?.ownerId === user.id || b?.spot.ownerId === user.id;
  if (!b || (!isTenant && !isOwner && user.role !== "ADMIN")) notFound();
  const owner = await prisma.user.findUniqueOrThrow({ where: { id: b.ownerId } });
  const t0 = now();
  const status = displayStatus(b);
  const showContact = contactVisible(b);
  const beforeStart = b.startsAt > t0;
  const active = b.status === "CONFIRMED" && b.startsAt <= t0 && b.endsAt > t0;
  const extensionEnd = new Date(b.endsAt.getTime() + HOUR);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href={isOwner && !isTenant ? "/bookings?role=owner" : "/bookings"} className="text-sm text-brand-700 hover:underline">← {t("back")}</Link>
      {sp.created ? <p role="status" className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{b.status === "CONFIRMED" ? t("createdInstant") : t("createdRequest")}</p> : null}
      {sp.checkout === "done" && b.status === "DRAFT" ? <p role="status" className="rounded-lg bg-slate-100 px-3 py-2 text-sm">{t("checkoutProcessing")}</p> : null}

      <div className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="h1">{t("title", { spot: b.spot.planNumber })}</h1>
          <div className="flex gap-1"><StatusBadge status={status} /><PaymentBadge status={b.paymentStatus} /></div>
        </div>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="font-medium text-slate-600">{t("spot")}</dt><dd>{b.spot.planNumber} · {b.spot.label}</dd>
          <dt className="font-medium text-slate-600">{t("start")}</dt><dd>{formatDateTime(b.startsAt, locale)}</dd>
          <dt className="font-medium text-slate-600">{t("end")}</dt><dd>{formatDateTime(b.endsAt, locale)}</dd>
          <dt className="font-medium text-slate-600">{t("price")}</dt>
          <dd>
            {formatEuro(b.priceCents, locale)}
            {isOwner && b.priceCents > 0 ? <span className="text-slate-500"> · {t("payoutEstimate", { payout: formatEuro(estimatePayoutCents(b.priceCents), locale) })}</span> : null}
          </dd>
          <dt className="font-medium text-slate-600">{t("tenant")}</dt><dd>{b.tenant.name} ({b.tenant.apartment})</dd>
          <dt className="font-medium text-slate-600">{t("owner")}</dt><dd>{owner.name} ({owner.apartment})</dd>
          {b.visitorName ? <><dt className="font-medium text-slate-600">{t("visitor")}</dt><dd>{b.visitorName}</dd></> : null}
          {b.licensePlate ? <><dt className="font-medium text-slate-600">{t("plate")}</dt><dd>{b.licensePlate}</dd></> : null}
          {b.status === "REQUESTED" && b.expiresAt ? <><dt className="font-medium text-slate-600">{t("expiresAt")}</dt><dd>{formatDateTime(b.expiresAt, locale)}</dd></> : null}
          {b.cancelledBy ? <><dt className="font-medium text-slate-600">{t("cancelledBy")}</dt><dd>{t(`by.${b.cancelledBy}`)}{b.cancelReason && b.cancelReason !== "payment" ? `: ${b.cancelReason}` : ""}</dd></> : null}
          {b.status === "DECLINED" && b.cancelReason === "overlap" ? <><dt className="font-medium text-slate-600">{t("note")}</dt><dd>{t("autoDeclined")} <Link className="text-brand-700 underline" href={`/?fromDate=${localDateString(b.startsAt)}&fromTime=${localTimeString(b.startsAt)}&toDate=${localDateString(b.endsAt)}&toTime=${localTimeString(b.endsAt)}`}>{t("otherSpots")}</Link></dd></> : null}
        </dl>

        {/* D-01: contact data and access notes only after confirmation, until 7 days after end */}
        {showContact ? (
          <div className="rounded-lg bg-green-50 p-3 text-sm">
            {isTenant ? (
              <>
                <p><strong>{t("ownerPhone")}:</strong> {owner.phone || "–"}</p>
                {b.spot.accessNotes ? <p className="mt-1 whitespace-pre-line"><strong>{t("accessNotes")}:</strong> {b.spot.accessNotes}</p> : null}
              </>
            ) : (
              <p><strong>{t("tenantPhone")}:</strong> {b.tenant.phone || "–"}</p>
            )}
          </div>
        ) : b.status === "CONFIRMED" ? null : (
          <p className="hint">{t("contactAfterConfirm")}</p>
        )}

        {b.status === "CONFIRMED" && b.paymentStatus === "FAILED" && isTenant ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm" role="alert">
            <p>{t("paymentFailed", { deadline: b.paymentRetryUntil ? formatDateTime(b.paymentRetryUntil, locale) : "–" })}</p>
            <div className="mt-2"><ActionButton action={retryPaymentAction.bind(null, b.id)} label={t("retryPayment")} /></div>
          </div>
        ) : null}
        {b.paymentStatus === "PROCESSING" ? <p className="text-sm text-slate-600">{t("sepaProcessing")}</p> : null}

        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          {b.contracts.length ? <a className="btn-secondary btn-small" href={`/api/contracts/${b.id}`}>{t("downloadContract")}</a> : null}
          {isTenant && b.status === "DRAFT" ? <ActionButton action={resumeDraftAction.bind(null, b.id)} label={t("resumePayment")} /> : null}
          {isOwner && b.status === "REQUESTED" ? (
            <>
              <ActionButton action={confirmAction.bind(null, b.id)} label={t("confirm")} />
              <ActionButton action={declineAction.bind(null, b.id)} label={t("decline")} className="btn-secondary btn-small" />
            </>
          ) : null}
          {isTenant && (b.status === "REQUESTED" || b.status === "DRAFT") ? (
            <ActionButton action={withdrawAction.bind(null, b.id)} label={t("withdraw")} className="btn-secondary btn-small" confirmText={t("withdrawConfirm")} />
          ) : null}
          {b.status === "CONFIRMED" && beforeStart && (isTenant || isOwner) ? (
            <CancelForm
              action={cancelAction.bind(null, b.id)}
              asOwner={isOwner && !isTenant}
              refundText={b.priceCents > 0 ? t("cancelRefund", { price: formatEuro(b.priceCents, locale) }) : t("cancelFree")}
            />
          ) : null}
        </div>
      </div>

      {/* B-09: extension of an active booking */}
      {isTenant && active ? (
        <div className="card">
          <h2 className="h2 mb-3">{t("extend")}</h2>
          <RequestForm
            spotId={b.spotId}
            extendsBookingId={b.id}
            fixedStart
            initial={{ fromDate: localDateString(b.endsAt), fromTime: localTimeString(b.endsAt), toDate: localDateString(extensionEnd), toTime: localTimeString(extensionEnd) }}
          />
        </div>
      ) : null}

      {/* D-02 */}
      {b.status === "CONFIRMED" && (isTenant || isOwner) ? (
        <div className="card">
          <h2 className="h2 mb-3">{t("reportProblem")}</h2>
          <ProblemForm action={reportProblemAction.bind(null, b.id)} />
        </div>
      ) : null}
      {b.problemReports.length ? (
        <div className="card space-y-3">
          <h2 className="h2">{t("problems")}</h2>
          {b.problemReports.map((r) => (
            <div key={r.id} className="rounded-lg border border-slate-200 p-3 text-sm">
              <p className="text-xs text-slate-500">{formatDateTime(r.createdAt, locale)} · {r.reporter.name} · {t(`problem.${r.category}`)} {r.resolvedAt ? `· ${t("resolved")}` : ""}</p>
              <p className="mt-1 whitespace-pre-line">{r.text}</p>
              <div className="mt-2 flex gap-2">
                {r.photos.map((p) => (
                  <a key={p.id} href={`/api/problem-photos/${p.id}`} target="_blank" rel="noreferrer">
                    <img src={`/api/problem-photos/${p.id}`} alt={t("photo")} className="h-20 w-20 rounded object-cover" />
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
