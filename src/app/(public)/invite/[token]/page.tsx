import { getTranslations } from "next-intl/server";
import { PublicShell } from "@/components/PublicShell";
import { PasswordForm } from "@/components/PasswordForm";
import { peekToken } from "@/lib/tokens";
import { acceptInvitationAction } from "@/app/actions/auth";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await getTranslations("auth");
  const rec = await peekToken(token, "INVITE");
  return (
    <PublicShell title={t("inviteTitle")}>
      {rec && rec.user.status === "INVITED" ? (
        <>
          <p className="mb-4 text-sm text-slate-600">{t("inviteIntro", { name: rec.user.name })}</p>
          <PasswordForm action={acceptInvitationAction} token={token} submitLabel={t("activateAccount")} />
        </>
      ) : (
        <p className="text-sm">{t("inviteInvalid")}</p>
      )}
    </PublicShell>
  );
}
