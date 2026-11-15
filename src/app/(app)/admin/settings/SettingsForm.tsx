"use client";
import { useTranslations } from "next-intl";
import { ActionForm, SubmitButton, type FormAction } from "@/components/ActionForm";

export function SettingsForm({ action, s }: { action: FormAction; s: Record<string, number | string> }) {
  const t = useTranslations("settings");
  const num = (name: string, value: number | string, min: number, max: number, help: string, step = 1) => (
    <div>
      <label className="label" htmlFor={name}>{t(`${name}.label`)}</label>
      <input className="input" id={name} name={name} type="number" min={min} max={max} step={step} defaultValue={value} required aria-describedby={`${name}-h`} />
      <p className="hint" id={`${name}-h`}>{help}</p>
    </div>
  );
  return (
    <ActionForm action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {num("tier1Hours", Number(s.tier1Minutes) / 60, 1, 720, t("tier1Hours.help"))}
        {num("tier2Days", s.tier2Days, 1, 90, t("tier2Days.help"))}
        {num("tier3Months", s.tier3Months, 1, 12, t("tier3Months.help"))}
        <div>
          <label className="label" htmlFor="maxDurationValue">{t("maxDuration.label")}</label>
          <div className="flex gap-2">
            <input className="input" id="maxDurationValue" name="maxDurationValue" type="number" min={1} max={366} defaultValue={s.maxDurationValue} required />
            <select className="input w-36" name="maxDurationUnit" defaultValue={String(s.maxDurationUnit)} aria-label={t("maxDuration.unit")}>
              <option value="DAY">{t("days")}</option>
              <option value="MONTH">{t("months")}</option>
            </select>
          </div>
          <p className="hint">{t("maxDuration.help")}</p>
        </div>
        {num("minLeadMinutes", s.minLeadMinutes, 0, 2880, t("minLeadMinutes.help"))}
        {num("minDurationMinutes", s.minDurationMinutes, 15, 1440, t("minDurationMinutes.help"), 15)}
        {num("fairnessLimit", s.fairnessLimit, 0, 100, t("fairnessLimit.help"))}
        {num("openRequestLimit", s.openRequestLimit, 1, 20, t("openRequestLimit.help"))}
        {num("requestExpiryHours", s.requestExpiryHours, 1, 168, t("requestExpiryHours.help"))}
      </div>
      <p className="hint">{t("existingUntouched")}</p>
      <SubmitButton>{t("save")}</SubmitButton>
    </ActionForm>
  );
}
