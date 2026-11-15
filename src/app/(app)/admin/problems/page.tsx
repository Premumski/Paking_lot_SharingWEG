import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/i18n/server";
import { ActionButton } from "@/components/ActionButton";
import { resolveProblemAction } from "@/app/actions/admin";

// A-07
export default async function AdminProblems() {
  const t = await getTranslations("admin");
  const tp = await getTranslations("bookingDetail");
  const locale = await getLocale();
  const reports = await prisma.problemReport.findMany({
    orderBy: [{ resolvedAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
    include: { booking: { include: { spot: true } }, reporter: true, photos: { select: { id: true } } },
    take: 200,
  });
  return (
    <div className="space-y-4">
      <h1 className="h1">{t("problems")}</h1>
      {reports.length === 0 ? <p className="card text-sm">{t("noProblems")}</p> : null}
      {reports.map((r) => (
        <div key={r.id} className={`card space-y-2 ${r.resolvedAt ? "opacity-60" : ""}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">{tp(`problem.${r.category}`)} · <Link href={`/bookings/${r.bookingId}`} className="text-brand-700 underline">{r.booking.spot.planNumber}</Link></p>
            {r.resolvedAt ? <span className="badge bg-green-100 text-green-800">{t("resolvedAt", { date: formatDateTime(r.resolvedAt, locale) })}</span> : <ActionButton action={resolveProblemAction.bind(null, r.id)} label={t("markResolved")} />}
          </div>
          <p className="text-xs text-slate-500">{formatDateTime(r.createdAt, locale)} · {r.reporter.name}</p>
          <p className="whitespace-pre-line text-sm">{r.text}</p>
          <div className="flex gap-2">{r.photos.map((p) => <a key={p.id} href={`/api/problem-photos/${p.id}`} target="_blank" rel="noreferrer"><img src={`/api/problem-photos/${p.id}`} alt={tp("photo")} className="h-20 w-20 rounded object-cover" /></a>)}</div>
        </div>
      ))}
    </div>
  );
}
