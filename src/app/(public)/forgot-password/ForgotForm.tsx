"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { forgotPasswordAction } from "@/app/actions/auth";

export function ForgotForm() {
  const t = useTranslations("auth");
  return (
    <ActionForm action={forgotPasswordAction} className="space-y-4" resetOnSuccess>
      <p className="text-sm text-slate-600">{t("forgotIntro")}</p>
      <div>
        <label className="label" htmlFor="email">{t("email")}</label>
        <input className="input" id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <SubmitButton className="btn-primary w-full">{t("sendResetLink")}</SubmitButton>
      <p className="text-center text-sm"><Link className="text-brand-700 hover:underline" href="/login">{t("backToLogin")}</Link></p>
    </ActionForm>
  );
}
