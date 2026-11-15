import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { now } from "@/lib/clock";
import { getSettings } from "@/lib/settings";
import { formatDate, formatDateTime } from "@/i18n/server";
import { localDateString } from "@/lib/domain/time";
import { formatEuro } from "@/lib/domain/pricing";
import { ActionButton } from "@/components/ActionButton";
import {
  addBlockAction,
  addRuleAction,
  deleteBlockAction,
  deleteRuleAction,
  togglePauseAction,
  updateSpotAction,
} from "@/app/actions/spots";
import { AddBlockForm, AddRuleForm, ConflictAwareForm, PauseButton, PriceSettingsForm } from "./SpotForms";

function hhmm(min: number | null) {
  const m = min ?? 0;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export default async function ManageSpotPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { user } = await requireUser();
  const t = await getTranslations("spotSettings");
  const tw = await getTranslations("weekdays");
  const locale = await getLocale();
  const spot = await prisma.parkingSpot.findUnique({
    where: { id },
    include: {
      rules: { orderBy: { createdAt: "asc" } },
      blocks: { where: { endsAt: { gt: now() } }, orderBy: { startsAt: "asc" } },
      bookings: { where: { status: { in: ["REQUESTED", "CONFIRMED"] }, endsAt: { gt: now() } }, orderBy: { startsAt: "asc" }, include: { tenant: true } },
    },
  });
  // P-02: only the owner can manage the spot.
  if (!spot || spot.ownerId !== user.id) notFound();
  const settings = await getSettings();
  const today = localDateString(now());

  const describe = (r: (typeof spot.rules)[number]) => {
    const until = r.validUntil ? ` · ${t("until", { date: formatDate(new Date(r.validUntil.getTime() - 1), locale) })}` : "";
    switch (r.kind) {
      case "MANUAL":
        return `${formatDateTime(r.startsAt, locale)} – ${r.endsAt ? formatDateTime(r.endsAt, locale) : "∞"}`;
      case "WEEKLY":
        return `${r.weekdays.map((d) => tw(String(d))).join(", ")} · ${hhmm(r.startMin)}–${r.endMin === 0 ? "24:00" : hhmm(r.endMin)}${until}`;
      case "WEEKENDS":
        return `${t("kind.WEEKENDS")}${until}`;
      case "ALWAYS":
        return `${t("kind.ALWAYS")}${until}`;
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/my-spots" className="text-sm text-brand-700 hover:underline">← {t("back")}</Link>
      <div className="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="h1">{spot.planNumber} · {spot.label}</h1>
          <p className="text-sm text-slate-600">{spot.paused ? t("pausedInfo") : t("activeInfo")}</p>
        </div>
        <PauseButton action={togglePauseAction.bind(null, spot.id)} paused={spot.paused} />
      </div>

      <div className="card">
        <PriceSettingsForm
          action={updateSpotAction.bind(null, spot.id)}
          onboarded={user.paymentOnboarded}
          global={{ tier1Minutes: settings.tier1Minutes, tier2Days: settings.tier2Days, tier3Months: settings.tier3Months }}
          spot={spot}
        />
      </div>

      <div className="card space-y-3">
        <h2 className="h2">{t("rules")}</h2>
        <p className="hint">{t("rulesHint")}</p>
        {spot.rules.length === 0 ? <p className="text-sm text-slate-500">{t("noRules")}</p> : null}
        <ul className="space-y-2">
          {spot.rules.map((r) => (
            <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-slate-200 p-2 text-sm">
              <span><strong>{t(`kind.${r.kind}`)}</strong> · {describe(r)}</span>
              <ConflictAwareForm action={deleteRuleAction.bind(null, spot.id, r.id)} submitLabel={t("delete")} />
            </li>
          ))}
        </ul>
        <div className="border-t border-slate-100 pt-3">
          <h3 className="mb-2 font-semibold">{t("newRule")}</h3>
          <AddRuleForm action={addRuleAction.bind(null, spot.id)} today={today} />
        </div>
      </div>

      <div className="card space-y-3">
        <h2 className="h2">{t("blocks")}</h2>
        <p className="hint">{t("blocksHint")}</p>
        <ul className="space-y-2">
          {spot.blocks.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-2 text-sm">
              <span>{formatDateTime(b.startsAt, locale)} – {formatDateTime(b.endsAt, locale)}{b.note ? ` · ${b.note}` : ""}</span>
              <ActionButton action={deleteBlockAction.bind(null, spot.id, b.id)} label={t("delete")} className="btn-secondary btn-small" />
            </li>
          ))}
        </ul>
        <AddBlockForm action={addBlockAction.bind(null, spot.id)} today={today} />
      </div>

      <div className="card">
        <h2 className="h2 mb-2">{t("upcoming")}</h2>
        {spot.bookings.length === 0 ? <p className="text-sm text-slate-500">{t("noUpcoming")}</p> : null}
        <ul className="space-y-1 text-sm">
          {spot.bookings.map((b) => (
            <li key={b.id}>
              <Link className="text-brand-700 underline" href={`/bookings/${b.id}`}>
                {formatDateTime(b.startsAt, locale)} – {formatDateTime(b.endsAt, locale)}
              </Link>{" "}
              · {b.tenant.name} · {formatEuro(b.priceCents, locale)} · {t(`bookingStatus.${b.status}`)}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
