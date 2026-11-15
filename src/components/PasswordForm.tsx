"use client";
import { useTranslations } from "next-intl";
import { ActionForm, SubmitButton, type FormAction } from "@/components/ActionForm";

export function PasswordForm({ action, token, submitLabel }: { action: FormAction; token: string; submitLabel: string }) {
  const t = useTranslations("auth");
  return (
    <ActionForm action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <div>
        <label className="label" htmlFor="password">{t("newPassword")}</label>
        <input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={12} required aria-describedby="pw-hint" />
        <p className="hint" id="pw-hint">{t("passwordRules")}</p>
      </div>
      <div>
        <label className="label" htmlFor="password2">{t("repeatPassword")}</label>
        <input className="input" id="password2" name="password2" type="password" autoComplete="new-password" minLength={12} required />
      </div>
      <SubmitButton className="btn-primary w-full">{submitLabel}</SubmitButton>
    </ActionForm>
  );
}
