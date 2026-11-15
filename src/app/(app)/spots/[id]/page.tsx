import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parsePeriod } from "@/lib/booking/search";
import { formatEuro } from "@/lib/domain/pricing";
import { RequestForm } from "./RequestForm";

export default async function SpotPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const { user } = await requireUser();
  const t = await getTranslations("request");
  const ts = await getTranslations("spotTypes");
  const locale = await getLocale();
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const spot = await prisma.parkingSpot.findUnique({ where: { id } });
  if (!spot) notFound();
  const period = parsePeriod(await searchParams);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/" className="text-sm text-brand-700 hover:underline">← {t("back")}</Link>
      <div className="card">
        <h1 className="h1">{spot.planNumber} · {spot.label}</h1>
        <p className="text-sm text-slate-600">{ts(spot.type)}</p>
        <p className="mt-2 text-sm">
          {t("pricePerHour", { price: formatEuro(spot.pricePerHourCents, locale) })} · {t("pricePerDay", { price: formatEuro(spot.pricePerDayCents, locale) })}
        </p>
        {spot.description ? <p className="mt-2 whitespace-pre-line text-sm">{spot.description}</p> : null}
        <p className="hint">{t("accessAfterConfirm")}</p>
      </div>
      {spot.ownerId === user.id ? (
        <p className="card text-sm">{t("ownSpot")}</p>
      ) : (
        <div className="card">
          <h2 className="h2 mb-3">{t("title")}</h2>
          <RequestForm spotId={spot.id} initial={{ fromDate: period.fromDate, fromTime: period.fromTime, toDate: period.toDate, toTime: period.toTime }} />
        </div>
      )}
    </div>
  );
}
