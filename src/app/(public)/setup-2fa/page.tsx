import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PublicShell } from "@/components/PublicShell";
import { TotpEnroll } from "@/components/TotpEnroll";
import { getAuth } from "@/lib/auth";
import { newTotpSecret, totpQrDataUrl } from "@/lib/totp";
import { PendingTotpCookie } from "./PendingTotpCookie";

export default async function SetupTwoFactorPage() {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  if (auth.user.totpEnabled && !auth.session.mfaVerified) redirect("/login/2fa");
  const t = await getTranslations("auth");
  const secret = newTotpSecret();
  const { dataUrl } = await totpQrDataUrl(secret, auth.user.email);
  return (
    <PublicShell title={t("setup2faTitle")}>
      {auth.user.role === "ADMIN" && !auth.user.totpEnabled ? (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{t("adminMust2fa")}</p>
      ) : null}
      <PendingTotpCookie secret={secret} />
      <TotpEnroll secret={secret} qr={dataUrl} />
    </PublicShell>
  );
}
