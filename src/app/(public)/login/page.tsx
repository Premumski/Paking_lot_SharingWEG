import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PublicShell } from "@/components/PublicShell";
import { getUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";
import { DevLogins } from "./DevLogins";
import { env } from "@/lib/env";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; done?: string }> }) {
  if (await getUser()) redirect("/");
  const sp = await searchParams;
  const t = await getTranslations("auth");
  return (
    <PublicShell title={t("loginTitle")}>
      {sp.done ? <p role="status" className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{t("passwordSetDone")}</p> : null}
      <LoginForm next={sp.next ?? "/"} />
      {env.devTools ? <DevLogins /> : null}
    </PublicShell>
  );
}
