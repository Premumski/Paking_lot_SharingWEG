"use client";
import { useTranslations } from "next-intl";
import { ActionForm, SubmitButton, type FormAction } from "@/components/ActionForm";

export function MockPayForm({ action, mode, booking, payment }: { action: FormAction; mode: string; booking?: string; payment?: string }) {
  const t = useTranslations("dev");
  if (mode === "onboarding") {
    return (
      <ActionForm action={action} className="space-y-3">
        <input type="hidden" name="mode" value="onboarding" />
        <p className="text-sm">{t("onboardingText")}</p>
        <SubmitButton>{t("onboardingDone")}</SubmitButton>
      </ActionForm>
    );
  }
  return (
    <ActionForm action={action} className="space-y-3">
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="booking" value={booking} />
      {payment ? <input type="hidden" name="payment" value={payment} /> : null}
      <fieldset className="space-y-2">
        <legend className="label">{t("chooseMethod")}</legend>
        {(["card_ok", "card_fail", "sepa"] as const).map((m, i) => (
          <label key={m} className="flex items-start gap-2 rounded-lg border border-slate-200 p-3 text-sm">
            <input type="radio" name="method" value={m} defaultChecked={i === 0} className="mt-0.5 h-5 w-5" />
            <span><strong>{t(`method.${m}.title`)}</strong><br /><span className="text-slate-600">{t(`method.${m}.text`)}</span></span>
          </label>
        ))}
      </fieldset>
      <SubmitButton>{mode === "retry" ? t("payNow") : t("saveMethod")}</SubmitButton>
    </ActionForm>
  );
}
