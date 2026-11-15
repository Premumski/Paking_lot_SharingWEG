"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { loginAction } from "@/app/actions/auth";

export function LoginForm({ next }: { next: string }) {
  const t = useTranslations("auth");
  return (
    <ActionForm action={loginAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <label className="label" htmlFor="email">{t("email")}</label>
        <input className="input" id="email" name="email" type="email" autoComplete="username" required />
      </div>
      <div>
        <label className="label" htmlFor="password">{t("password")}</label>
        <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <SubmitButton className="btn-primary w-full">{t("login")}</SubmitButton>
      <p className="text-center text-sm">
        <Link className="text-brand-700 hover:underline" href="/forgot-password">{t("forgot")}</Link>
      </p>
      <p className="hint text-center">{t("noRegistration")}</p>
    </ActionForm>
  );
}
