"use client";
import { useTranslations } from "next-intl";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { verifyTotpAction } from "@/app/actions/auth";

export function TotpForm({ next }: { next: string }) {
  const t = useTranslations("auth");
  return (
    <ActionForm action={verifyTotpAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <label className="label" htmlFor="code">{t("totpCode")}</label>
        <input className="input text-center text-xl tracking-[0.4em]" id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus />
        <p className="hint">{t("totpHint")}</p>
      </div>
      <SubmitButton className="btn-primary w-full">{t("verify")}</SubmitButton>
    </ActionForm>
  );
}
