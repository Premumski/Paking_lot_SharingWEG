import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { PublicShell } from "@/components/PublicShell";
import { ActionButton } from "@/components/ActionButton";
import { getUser } from "@/lib/auth";
import { peekToken } from "@/lib/tokens";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/i18n/server";
import { formatEuro } from "@/lib/domain/pricing";
import { emailDecisionAction } from "@/app/actions/email-actions";

export default async function EmailActionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/a/${token}`)}`);
  const t = await getTranslations("emailAction");
  const locale = await getLocale();
  const rec = await peekToken(token, "ACTION");
  const payload = rec?.payload as { bookingId: string; action: "confirm" | "decline" } | undefined;
  const booking = payload && rec?.userId === user.id ? await prisma.booking.findUnique({ where: { id: payload.bookingId }, include: { spot: true, tenant: true } }) : null;
  return (
    <PublicShell title={t("title")}>
      {!booking || !payload ? (
        <p className="text-sm">{t("invalid")}</p>
      ) : booking.status !== "REQUESTED" ? (
        <p className="text-sm">{t("alreadyHandled")} <a className="text-brand-700 underline" href={`/bookings/${booking.id}`}>{t("open")}</a></p>
      ) : (
        <div className="space-y-3 text-sm">
          <p>{t("summary", { spot: booking.spot.planNumber, tenant: booking.tenant.name })}</p>
          <p>{formatDateTime(booking.startsAt, locale)} – {formatDateTime(booking.endsAt, locale)} · {formatEuro(booking.priceCents, locale)}</p>
          <ActionButton
            action={emailDecisionAction.bind(null, token)}
            label={payload.action === "confirm" ? t("confirm") : t("decline")}
            className={payload.action === "confirm" ? "btn-primary w-full" : "btn-danger w-full"}
          />
        </div>
      )}
    </PublicShell>
  );
}
