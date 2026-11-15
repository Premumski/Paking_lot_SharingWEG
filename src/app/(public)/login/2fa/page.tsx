import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PublicShell } from "@/components/PublicShell";
import { getAuth } from "@/lib/auth";
import { TotpForm } from "./TotpForm";

export default async function TwoFactorPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  if (auth.session.mfaVerified) redirect("/");
  if (!auth.user.totpEnabled) redirect("/setup-2fa");
  const t = await getTranslations("auth");
  return (
    <PublicShell title={t("totpTitle")}>
      <TotpForm next={(await searchParams).next ?? "/"} />
    </PublicShell>
  );
}
