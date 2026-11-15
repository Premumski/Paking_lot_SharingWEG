"use client";
import { useTranslations } from "next-intl";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { confirmTotpEnrollment } from "@/app/actions/auth";

export function TotpEnroll({ secret, qr }: { secret: string; qr: string }) {
  const t = useTranslations("auth");
  return (
    <div className="space-y-4">
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        <li>{t("enrollStep1")}</li>
        <li>{t("enrollStep2")}</li>
        <li>{t("enrollStep3")}</li>
      </ol>
      <img src={qr} alt={t("qrAlt")} width={220} height={220} className="mx-auto rounded border" />
      <p className="text-center text-xs text-slate-500">
        {t("manualKey")}: <code className="select-all break-all font-mono">{secret}</code>
      </p>
      <ActionForm action={confirmTotpEnrollment} className="space-y-3">
        <input type="hidden" name="secret" value={secret} />
        <label className="label" htmlFor="code">{t("totpCode")}</label>
        <input className="input text-center text-xl tracking-[0.4em]" id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required />
        <SubmitButton className="btn-primary w-full">{t("enable2fa")}</SubmitButton>
      </ActionForm>
    </div>
  );
}
