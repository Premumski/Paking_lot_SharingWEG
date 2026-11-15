"use client";
import { useEffect, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { TimeRange } from "@/components/TimeRange";
import { Markdown } from "@/components/Markdown";
import { quoteAction, requestAction } from "@/app/actions/bookings";
import type { Quote } from "@/lib/booking/quote";
import { formatEuro } from "@/lib/domain/pricing";

type Period = { fromDate: string; fromTime: string; toDate: string; toTime: string };

function fmt(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "de-DE", {
    timeZone: "Europe/Berlin", weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}

function isoDate(iso: string) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date(iso));
}

export function RequestForm({
  spotId,
  initial,
  extendsBookingId,
  fixedStart,
}: {
  spotId: string;
  initial: Period;
  extendsBookingId?: string;
  fixedStart?: boolean;
}) {
  const t = useTranslations("request");
  const te = useTranslations("errors");
  const locale = useLocale();
  const [period, setPeriod] = useState<Period>(initial);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [contract, setContract] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const id = setTimeout(() => {
      startTransition(async () => {
        const res = await quoteAction({ spotId, ...period, extendsBookingId });
        setQuote(res.quote);
        setContract(res.contract);
      });
    }, 250);
    return () => clearTimeout(id);
  }, [period, spotId, extendsBookingId]);

  const paid = (quote?.priceCents ?? 0) > 0;
  return (
    <ActionForm action={requestAction} className="space-y-5">
      <input type="hidden" name="spotId" value={spotId} />
      {extendsBookingId ? <input type="hidden" name="extendsBookingId" value={extendsBookingId} /> : null}
      {fixedStart ? (
        <>
          <input type="hidden" name="fromDate" value={period.fromDate} />
          <input type="hidden" name="fromTime" value={period.fromTime} />
          <p className="text-sm">{t("extensionStart", { start: `${period.fromDate} ${period.fromTime}` })}</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="ext-td">{t("newEndDate")}</label>
              <input className="input" type="date" id="ext-td" name="toDate" value={period.toDate} onChange={(e) => setPeriod({ ...period, toDate: e.target.value })} required />
            </div>
            <div>
              <label className="label" htmlFor="ext-tt">{t("newEndTime")}</label>
              <select className="input" id="ext-tt" name="toTime" value={period.toTime} onChange={(e) => setPeriod({ ...period, toTime: e.target.value })}>
                {Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`).map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </div>
          </div>
        </>
      ) : (
        <TimeRange values={period} onChange={setPeriod} idPrefix="req" maxStartDate={quote ? isoDate(quote.latestStart) : undefined} />
      )}

      {/* T-14: tier and latest possible start */}
      <div className="rounded-lg bg-slate-50 p-3 text-sm" aria-live="polite" aria-busy={pending}>
        {quote ? (
          <>
            <p>{t("tierInfo", { tier: quote.tier, latest: fmt(quote.latestStart, locale) })}</p>
            {quote.error ? <p className="mt-1 font-medium text-red-700" role="alert">{te(`booking.${quote.error}`)}</p> : null}
          </>
        ) : (
          <p>{t("calculating")}</p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="visitorName">{t("visitorName")}</label>
          <input className="input" id="visitorName" name="visitorName" maxLength={80} autoComplete="off" />
        </div>
        <div>
          <label className="label" htmlFor="licensePlate">{t("licensePlate")}</label>
          <input className="input uppercase" id="licensePlate" name="licensePlate" maxLength={15} autoComplete="off" />
        </div>
      </div>

      {quote?.ok ? (
        <section className="rounded-lg border border-brand-100 bg-brand-50 p-4" aria-labelledby="summary-h">
          <h2 id="summary-h" className="h2 mb-2">{t("summary")}</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-slate-600">{t("period")}</dt>
            <dd>{period.fromDate} {period.fromTime} – {period.toDate} {period.toTime}</dd>
            <dt className="text-slate-600">{t("finalPrice")}</dt>
            <dd className="text-lg font-bold">{formatEuro(quote.priceCents, locale)}</dd>
          </dl>
          <p className={`mt-2 text-sm font-medium ${quote.instant ? "text-green-800" : "text-amber-800"}`}>
            {quote.instant ? t("willBeInstant") : t("willWaitForOwner")}
          </p>
          <p className="mt-1 text-sm">{t("freeCancellation")}</p>
          {paid ? <p className="mt-1 text-sm">{t("chargedOnConfirm")}</p> : <p className="mt-1 text-sm">{t("noPayment")}</p>}
        </section>
      ) : null}

      {/* V-03: not pre-selected confirmation with viewable contract text */}
      <div className="space-y-2">
        {contract ? (
          <details className="rounded-lg border border-slate-200 p-3 text-sm">
            <summary className="cursor-pointer font-medium text-brand-700">{t("showContract")}</summary>
            <div className="mt-2 max-h-80 overflow-auto"><Markdown text={contract} /></div>
          </details>
        ) : null}
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="acceptContract" className="mt-1 h-5 w-5" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
          <span>{t("acceptContract")}</span>
        </label>
      </div>

      <SubmitButton disabled={!quote?.ok || !accepted} className="btn-primary w-full sm:w-auto">
        {paid ? t("continueToPayment") : quote?.instant ? t("bookNow") : t("sendRequest")}
      </SubmitButton>
    </ActionForm>
  );
}
