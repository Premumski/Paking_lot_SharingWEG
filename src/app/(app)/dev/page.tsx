import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { getClockOffset, now } from "@/lib/clock";
import { syncClock } from "@/lib/jobs";
import { formatDateTime } from "@/i18n/server";
import { formatEuro } from "@/lib/domain/pricing";
import { ActionButton } from "@/components/ActionButton";
import { runJobsAction, sepaOutcomeAction, setClockAction } from "@/app/actions/dev";
import { ClockForm } from "./ClockForm";

export default async function DevPage() {
  if (!env.devTools) notFound();
  await requireUser();
  await syncClock();
  const t = await getTranslations("dev");
  const locale = await getLocale();
  const [processing, mails] = await Promise.all([
    prisma.payment.findMany({ where: { status: "PROCESSING" }, include: { booking: { include: { spot: true, tenant: true } } } }),
    prisma.devMail.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  return (
    <div className="space-y-4">
      <h1 className="h1">{t("title")}</h1>
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{t("intro")}</p>

      <section className="card space-y-3">
        <h2 className="h2">{t("clock")}</h2>
        <p className="text-sm">{t("clockNow", { time: formatDateTime(now(), locale), hours: Math.round(getClockOffset() / 3600_000) })}</p>
        <ClockForm action={setClockAction} />
        <ActionButton action={runJobsAction} label={t("runJobs")} className="btn-secondary btn-small" />
        <p className="hint">{t("jobsHint")}</p>
      </section>

      <section className="card space-y-2">
        <h2 className="h2">{t("sepa")}</h2>
        {processing.length === 0 ? <p className="text-sm text-slate-500">{t("noSepa")}</p> : null}
        {processing.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-2 text-sm">
            <span>{p.booking.spot.planNumber} · {p.booking.tenant.name} · {formatEuro(p.amountCents, locale)}</span>
            <ActionButton action={sepaOutcomeAction.bind(null, p.id, true)} label={t("sepaOk")} className="btn-primary btn-small" />
            <ActionButton action={sepaOutcomeAction.bind(null, p.id, false)} label={t("sepaBounce")} className="btn-danger btn-small" />
          </div>
        ))}
      </section>

      <section className="card space-y-2">
        <h2 className="h2">{t("mailbox")}</h2>
        <p className="text-sm">{t("mailpit")} <a className="text-brand-700 underline" href={process.env.MAILPIT_URL ?? "http://localhost:8025"} target="_blank" rel="noreferrer">{process.env.MAILPIT_URL ?? "http://localhost:8025"}</a></p>
        <ul className="divide-y divide-slate-100">
          {mails.map((m) => (
            <li key={m.id} className="py-2 text-sm">
              <details>
                <summary className="cursor-pointer"><span className="text-xs text-slate-500">{formatDateTime(m.createdAt, locale)} · {m.to}</span><br />{m.subject}</summary>
                <pre className="mt-2 whitespace-pre-wrap break-all rounded bg-slate-50 p-2 text-xs">{m.text}</pre>
              </details>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
