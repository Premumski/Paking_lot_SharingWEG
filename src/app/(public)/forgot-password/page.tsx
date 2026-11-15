import { getTranslations } from "next-intl/server";
import { PublicShell } from "@/components/PublicShell";
import { ForgotForm } from "./ForgotForm";

export default async function ForgotPage() {
  const t = await getTranslations("auth");
  return (
    <PublicShell title={t("forgotTitle")}>
      <ForgotForm />
    </PublicShell>
  );
}
