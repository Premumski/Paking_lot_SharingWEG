import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PublicShell } from "@/components/PublicShell";
import { PasswordForm } from "@/components/PasswordForm";
import { peekToken } from "@/lib/tokens";
import { resetPasswordAction } from "@/app/actions/auth";

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await getTranslations("auth");
  const rec = await peekToken(token, "RESET");
  return (
    <PublicShell title={t("resetTitle")}>
      {rec ? (
        <PasswordForm action={resetPasswordAction} token={token} submitLabel={t("savePassword")} />
      ) : (
        <p className="text-sm">{t("linkInvalid")} <Link href="/forgot-password" className="text-brand-700 underline">{t("requestNewLink")}</Link></p>
      )}
    </PublicShell>
  );
}
