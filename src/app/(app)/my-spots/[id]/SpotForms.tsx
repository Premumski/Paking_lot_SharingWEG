"use client";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ActionForm, FormMessage, PendingProvider, SubmitButton, useActionForm, type FormAction } from "@/components/ActionForm";
import { TimeRange, TIME_OPTIONS } from "@/components/TimeRange";
import { estimatePayoutCents, formatEuro, parseEuroToCents } from "@/lib/domain/pricing";

export function PriceSettingsForm({
  action,
  spot,
  onboarded,
  global,
}: {
  action: FormAction;
  spot: {
    pricePerHourCents: number;
    pricePerDayCents: number;
    description: string;
    accessNotes: string;
    instantBooking: boolean;
    instantMaxMinutes: number;
    tier1Minutes: number | null;
    tier2Days: number | null;
    tier3Months: number | null;
  };
  onboarded: boolean;
  global: { tier1Minutes: number; tier2Days: number; tier3Months: number };
}) {
  const t = useTranslations("spotSettings");
  const locale = useLocale();
  const [hourly, setHourly] = useState((spot.pricePerHourCents / 100).toFixed(2).replace(".", locale === "de" ? "," : "."));
  const [daily, setDaily] = useState((spot.pricePerDayCents / 100).toFixed(2).replace(".", locale === "de" ? "," : "."));
  const [instant, setInstant] = useState(spot.instantBooking);
  const initialUnit = spot.instantMaxMinutes % 1440 === 0 ? "days" : spot.instantMaxMinutes % 60 === 0 ? "hours" : "minutes";
  const initialValue = initialUnit === "days" ? spot.instantMaxMinutes / 1440 : initialUnit === "hours" ? spot.instantMaxMinutes / 60 : spot.instantMaxMinutes;
  const h = parseEuroToCents(hourly) ?? 0;
  const d = parseEuroToCents(daily) ?? 0;
  return (
    <ActionForm action={action} className="space-y-4">
      <fieldset className="space-y-3">
        <legend className="h2">{t("prices")}</legend>
        {!onboarded ? <p className="rounded bg-slate-100 p-2 text-sm">{t("freeOnly")}</p> : null}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="pph">{t("perHour")}</label>
            <input className="input" id="pph" name="pricePerHour" inputMode="decimal" value={hourly} onChange={(e) => setHourly(e.target.value)} readOnly={!onboarded} />
            {/* Z-05: owner sees payout after estimated fee */}
            {onboarded && h > 0 ? <p className="hint">{t("payout", { amount: formatEuro(estimatePayoutCents(h), locale) })}</p> : null}
          </div>
          <div>
            <label className="label" htmlFor="ppd">{t("perDay")}</label>
            <input className="input" id="ppd" name="pricePerDay" inputMode="decimal" value={daily} onChange={(e) => setDaily(e.target.value)} readOnly={!onboarded} />
            {onboarded && d > 0 ? <p className="hint">{t("payout", { amount: formatEuro(estimatePayoutCents(d), locale) })}</p> : null}
          </div>
        </div>
        {h > 0 && d === 0 ? <p className="text-sm text-amber-800">{t("dailyZeroWarning")}</p> : null}
        <p className="hint">{t("priceRule")}</p>
      </fieldset>

      <div>
        <label className="label" htmlFor="description">{t("description")}</label>
        <textarea className="input min-h-20" id="description" name="description" defaultValue={spot.description} maxLength={1000} />
      </div>
      <div>
        <label className="label" htmlFor="accessNotes">{t("accessNotes")}</label>
        <textarea className="input min-h-20" id="accessNotes" name="accessNotes" defaultValue={spot.accessNotes} maxLength={1000} />
        <p className="hint">{t("accessNotesHint")}</p>
      </div>

      <fieldset className="space-y-2">
        <legend className="h2">{t("confirmation")}</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="instantBooking" value="off" checked={!instant} onChange={() => setInstant(false)} className="h-5 w-5" /> {t("manual")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="instantBooking" value="on" checked={instant} onChange={() => setInstant(true)} className="h-5 w-5" /> {t("instant")}
        </label>
        <div className="flex items-end gap-2">
          <div>
            <label className="label" htmlFor="instantValue">{t("threshold")}</label>
            <input className="input w-24" id="instantValue" name="instantValue" type="number" min={1} max={525600} defaultValue={initialValue} />
          </div>
          <select className="input w-32" name="instantUnit" defaultValue={initialUnit} aria-label={t("thresholdUnit")}>
            <option value="minutes">{t("minutes")}</option>
            <option value="hours">{t("hours")}</option>
            <option value="days">{t("days")}</option>
          </select>
        </div>
        <p className="hint">{t("thresholdHint")}</p>
      </fieldset>

      <details className="rounded-lg border border-slate-200 p-3">
        <summary className="cursor-pointer text-sm font-medium">{t("horizonTitle")}</summary>
        <p className="hint mb-2">{t("horizonHint")}</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="tier1">{t("tier1", { max: Math.floor(global.tier1Minutes / 60) })}</label>
            <input className="input" id="tier1" name="tier1Hours" type="number" min={1} max={Math.floor(global.tier1Minutes / 60)} defaultValue={spot.tier1Minutes ? spot.tier1Minutes / 60 : ""} placeholder={String(Math.floor(global.tier1Minutes / 60))} />
          </div>
          <div>
            <label className="label" htmlFor="tier2">{t("tier2", { max: global.tier2Days })}</label>
            <input className="input" id="tier2" name="tier2Days" type="number" min={1} max={global.tier2Days} defaultValue={spot.tier2Days ?? ""} placeholder={String(global.tier2Days)} />
          </div>
          <div>
            <label className="label" htmlFor="tier3">{t("tier3", { max: global.tier3Months })}</label>
            <input className="input" id="tier3" name="tier3Months" type="number" min={1} max={global.tier3Months} defaultValue={spot.tier3Months ?? ""} placeholder={String(global.tier3Months)} />
          </div>
        </div>
      </details>
      <SubmitButton>{t("save")}</SubmitButton>
    </ActionForm>
  );
}

export function PauseButton({ action, paused }: { action: FormAction; paused: boolean }) {
  const t = useTranslations("spotSettings");
  const { state, pending, formProps } = useActionForm(action);
  const bookings = (state?.data as { bookings?: { id: string; label: string }[] } | undefined)?.bookings ?? [];
  return (
    <form {...formProps}>
      <PendingProvider pending={pending}>
        <SubmitButton className={paused ? "btn-primary" : "btn-secondary"}>{paused ? t("resume") : t("pause")}</SubmitButton>
      </PendingProvider>
      <FormMessage state={state} />
      {bookings.length ? (
        <ul className="mt-2 list-disc pl-5 text-sm">
          {bookings.map((b) => <li key={b.id}><a className="text-brand-700 underline" href={`/bookings/${b.id}`}>{b.label}</a></li>)}
        </ul>
      ) : null}
    </form>
  );
}

/** P-09: shows colliding bookings and asks for explicit cancellation. */
export function ConflictAwareForm({ action, children, submitLabel, className }: { action: FormAction; children?: React.ReactNode; submitLabel: string; className?: string }) {
  const t = useTranslations("spotSettings");
  const { state, pending, formProps } = useActionForm(action);
  const conflicts = (!state?.ok && (state?.data as { conflicts?: { id: string; label: string }[] } | undefined)?.conflicts) || [];
  return (
    <form {...formProps} className={className}>
      <PendingProvider pending={pending}>
      {children}
      {conflicts.length ? (
        <div className="mt-2 space-y-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm" role="alert">
          <p>{t("conflictIntro")}</p>
          <ul className="list-disc pl-5">{conflicts.map((c) => <li key={c.id}>{c.label}</li>)}</ul>
          <input type="hidden" name="confirmCancel" value="1" />
          <label className="label" htmlFor="reason">{t("cancelReason")}</label>
          <input className="input" id="reason" name="reason" required minLength={3} maxLength={300} />
          <SubmitButton className="btn-danger btn-small">{t("cancelAndContinue")}</SubmitButton>
        </div>
      ) : (
        <SubmitButton className="btn-secondary btn-small">{submitLabel}</SubmitButton>
      )}
      {conflicts.length ? null : <FormMessage state={state} />}
      </PendingProvider>
    </form>
  );
}

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

export function AddRuleForm({ action, today }: { action: FormAction; today: string }) {
  const t = useTranslations("spotSettings");
  const tw = useTranslations("weekdays");
  const [kind, setKind] = useState("WEEKLY");
  return (
    <ActionForm action={action} className="space-y-3" resetOnSuccess>
      <div>
        <label className="label" htmlFor="kind">{t("ruleKind")}</label>
        <select className="input" id="kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="MANUAL">{t("kind.MANUAL")}</option>
          <option value="WEEKLY">{t("kind.WEEKLY")}</option>
          <option value="WEEKENDS">{t("kind.WEEKENDS")}</option>
          <option value="ALWAYS">{t("kind.ALWAYS")}</option>
        </select>
      </div>
      {kind === "MANUAL" ? (
        <TimeRange values={{ fromDate: today, fromTime: "08:00", toDate: today, toTime: "18:00" }} idPrefix="rule" minDate={today} />
      ) : null}
      {kind === "WEEKLY" ? (
        <>
          <fieldset>
            <legend className="label">{t("weekdays")}</legend>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((d) => (
                <label key={d} className="flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-sm">
                  <input type="checkbox" name="weekdays" value={d} defaultChecked={d <= 5} /> {tw(String(d))}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="startTime">{t("from")}</label>
              <select className="input" id="startTime" name="startTime" defaultValue="08:00">{TIME_OPTIONS.map((o) => <option key={o}>{o}</option>)}</select>
            </div>
            <div>
              <label className="label" htmlFor="endTime">{t("to")}</label>
              <select className="input" id="endTime" name="endTime" defaultValue="17:00">{[...TIME_OPTIONS, "24:00"].map((o) => <option key={o}>{o}</option>)}</select>
            </div>
          </div>
        </>
      ) : null}
      {kind !== "MANUAL" ? (
        <div>
          <label className="label" htmlFor="validUntil">{t("validUntil")}</label>
          <input className="input" id="validUntil" name="validUntil" type="date" min={today} />
        </div>
      ) : null}
      <SubmitButton className="btn-primary btn-small">{t("addRule")}</SubmitButton>
    </ActionForm>
  );
}

export function AddBlockForm({ action, today }: { action: FormAction; today: string }) {
  const t = useTranslations("spotSettings");
  return (
    <ConflictAwareForm action={action} submitLabel={t("addBlock")} className="space-y-3">
      <TimeRange values={{ fromDate: today, fromTime: "08:00", toDate: today, toTime: "18:00" }} idPrefix="block" minDate={today} />
      <div>
        <label className="label" htmlFor="note">{t("blockNote")}</label>
        <input className="input" id="note" name="note" maxLength={200} />
      </div>
    </ConflictAwareForm>
  );
}
