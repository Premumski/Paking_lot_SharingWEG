"use client";
import { useTranslations } from "next-intl";

export const TIME_OPTIONS = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`);

/** P-04: date + time in 15-minute steps. Controlled or uncontrolled. */
export function TimeRange({
  values,
  onChange,
  maxStartDate,
  minDate,
  idPrefix = "tr",
}: {
  values: { fromDate: string; fromTime: string; toDate: string; toTime: string };
  onChange?: (v: { fromDate: string; fromTime: string; toDate: string; toTime: string }) => void;
  maxStartDate?: string;
  minDate?: string;
  idPrefix?: string;
}) {
  const t = useTranslations("time");
  const controlled = Boolean(onChange);
  const set = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange?.({ ...values, [k]: e.target.value });
  const field = (k: keyof typeof values) =>
    controlled ? { value: values[k], onChange: set(k) } : { defaultValue: values[k] };
  return (
    <fieldset className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <legend className="sr-only">{t("period")}</legend>
      <div>
        <label className="label" htmlFor={`${idPrefix}-fd`}>{t("fromDate")}</label>
        <input className="input" type="date" id={`${idPrefix}-fd`} name="fromDate" required min={minDate} max={maxStartDate} {...field("fromDate")} />
      </div>
      <div>
        <label className="label" htmlFor={`${idPrefix}-ft`}>{t("fromTime")}</label>
        <select className="input" id={`${idPrefix}-ft`} name="fromTime" {...field("fromTime")}>
          {TIME_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor={`${idPrefix}-td`}>{t("toDate")}</label>
        <input className="input" type="date" id={`${idPrefix}-td`} name="toDate" required min={minDate} {...field("toDate")} />
      </div>
      <div>
        <label className="label" htmlFor={`${idPrefix}-tt`}>{t("toTime")}</label>
        <select className="input" id={`${idPrefix}-tt`} name="toTime" {...field("toTime")}>
          {TIME_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    </fieldset>
  );
}
