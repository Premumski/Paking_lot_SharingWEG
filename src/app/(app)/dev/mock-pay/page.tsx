import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { env } from "@/lib/env";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatEuro } from "@/lib/domain/pricing";
import { mockPayAction } from "@/app/actions/dev";
import { MockPayForm } from "./MockPayForm";

/** Imitates Stripe's hosted pages (Checkout / Connect onboarding) for local tests. */
export default async function MockPayPage({ searchParams }: { searchParams: Promise<{ mode?: string; booking?: string; payment?: string }> }) {
  if (!env.devTools || env.paymentProvider !== "mock") notFound();
  const { user } = await requireUser();
  const sp = await searchParams;
  const t = await getTranslations("dev");
  const locale = await getLocale();
  const mode = sp.mode ?? "setup";
  const booking = sp.booking ? await prisma.booking.findUnique({ where: { id: sp.booking }, include: { spot: true } }) : null;
  if (mode !== "onboarding" && (!booking || booking.tenantId !== user.id)) notFound();
  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="card space-y-3 border-2 border-dashed border-amber-400">
        <p className="badge bg-amber-100 text-amber-900">{t("mockBadge")}</p>
        <h1 className="h1">{mode === "onboarding" ? t("onboardingTitle") : mode === "retry" ? t("retryTitle") : t("setupTitle")}</h1>
        {booking ? <p className="text-sm">{t("mockFor", { spot: booking.spot.planNumber, price: formatEuro(booking.priceCents, locale) })}</p> : null}
        {mode === "setup" ? <p className="hint">{t("setupHint")}</p> : null}
        <MockPayForm action={mockPayAction} mode={mode} booking={booking?.id} payment={sp.payment} />
      </div>
    </div>
  );
}
