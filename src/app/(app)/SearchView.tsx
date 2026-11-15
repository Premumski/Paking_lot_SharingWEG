"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { GarageMap, type MapLevel } from "@/components/GarageMap";
import { TimeRange } from "@/components/TimeRange";
import type { SpotState } from "@/lib/booking/search";
import { formatEuro } from "@/lib/domain/pricing";

export function SearchView({
  levels,
  spots,
  period,
  periodValid,
}: {
  levels: MapLevel[];
  spots: SpotState[];
  period: { fromDate: string; fromTime: string; toDate: string; toTime: string };
  periodValid: boolean;
}) {
  const t = useTranslations("map");
  const ts = useTranslations("spotTypes");
  const locale = useLocale();
  const hasMap = levels.length > 0;
  const [view, setView] = useState<"map" | "list">(hasMap ? "map" : "list");
  const [selected, setSelected] = useState<string | null>(null);
  // Level of every spot, taken from the plan that contains its area
  const levelOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of levels) for (const n of l.planNumbers) if (!map.has(n)) map.set(n, l.name);
    return map;
  }, [levels]);
  // Start on the first level that has a free spot; a level chosen by the user wins.
  const [level, setLevel] = useState(
    () => (levels.find((l) => spots.some((s) => s.state === "free" && levelOf.get(s.planNumber) === l.name)) ?? levels[0])?.name ?? null,
  );
  useEffect(() => {
    try {
      const v = localStorage.getItem("searchView");
      if ((v === "map" && hasMap) || v === "list") setView(v);
      const l = sessionStorage.getItem("searchLevel");
      if (l && levels.some((x) => x.name === l)) setLevel(l);
    } catch {}
  }, [hasMap, levels]);
  const choose = (v: "map" | "list") => {
    setView(v);
    try {
      localStorage.setItem("searchView", v);
    } catch {}
  };
  const chooseLevel = useCallback((name: string) => {
    setLevel(name);
    try {
      sessionStorage.setItem("searchLevel", name);
    } catch {}
  }, []);
  const onSelect = useCallback((id: string) => setSelected(id), []);
  const qs = new URLSearchParams(period).toString();
  const sel = spots.find((s) => s.id === selected) ?? null;
  const free = spots.filter((s) => s.state === "free").length;

  return (
    <div className="space-y-4">
      <form method="get" className="card space-y-3" aria-label={t("searchForm")}>
        <TimeRange values={period} idPrefix="search" />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button className="btn-primary">{t("show")}</button>
          <p className="text-sm text-slate-600" role="status">
            {periodValid ? t("freeCount", { count: free }) : t("invalidPeriod")}
          </p>
        </div>
      </form>

      <div className="flex gap-2" role="tablist" aria-label={t("viewSwitch")}>
        {hasMap ? (
          <button role="tab" aria-selected={view === "map"} className={view === "map" ? "btn-primary btn-small" : "btn-secondary btn-small"} onClick={() => choose("map")}>
            {t("mapView")}
          </button>
        ) : null}
        <button role="tab" aria-selected={view === "list"} className={view === "list" ? "btn-primary btn-small" : "btn-secondary btn-small"} onClick={() => choose("list")}>
          {t("listView")}
        </button>
      </div>

      {view === "map" && hasMap ? (
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <GarageMap levels={levels} level={level ?? levels[0].name} onLevel={chooseLevel} spots={spots} selectedId={selected} onSelect={onSelect} />
          <aside className="card h-fit" aria-live="polite">
            {sel ? (
              <SpotDetail spot={sel} level={levelOf.get(sel.planNumber)} qs={qs} locale={locale} />
            ) : (
              <p className="text-sm text-slate-600">{t("clickHint")}</p>
            )}
          </aside>
        </div>
      ) : (
        // K-04: accessible list with the same information (cards on phones, table from sm up)
        <>
          <ul className="space-y-2 sm:hidden" aria-label={t("listCaption")}>
            {spots.map((s) => (
              <li key={s.id} className={`card flex items-center justify-between gap-3 p-3 ${s.own ? "border-brand-600" : ""}`}>
                <div className="min-w-0">
                  <p className="font-semibold">{s.planNumber} <span className="font-normal">{s.label}</span></p>
                  <p className="text-xs text-slate-500">{levelOf.has(s.planNumber) ? `${levelOf.get(s.planNumber)} · ` : ""}{ts(s.type)}{s.own ? ` · ${t("ownSpot")}` : ""}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                    <span className={`badge ${s.state === "free" ? "bg-green-100 text-green-800" : "bg-slate-200 text-slate-700"}`}>
                      {t(s.state === "free" ? "free" : "busyShort")}
                    </span>
                    {s.state === "free" ? <strong>{formatEuro(s.priceCents, locale)}</strong> : null}
                    {s.state === "free" && s.instant ? <span className="text-xs text-green-700">{t("instant")}</span> : null}
                  </p>
                </div>
                {s.state === "free" ? (
                  <Link className="btn-primary btn-small shrink-0" href={`/spots/${s.id}?${qs}`}>
                    {t("request")}<span className="sr-only"> {s.planNumber}</span>
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="card hidden overflow-x-auto p-0 sm:block sm:p-0">
            <table className="table">
              <caption className="sr-only">{t("listCaption")}</caption>
              <thead>
                <tr>
                  <th scope="col">{t("spot")}</th>
                  <th scope="col">{t("status")}</th>
                  <th scope="col">{t("prices")}</th>
                  <th scope="col">{t("priceForPeriod")}</th>
                  <th scope="col"><span className="sr-only">{t("actions")}</span></th>
                </tr>
              </thead>
              <tbody>
                {spots.map((s) => (
                  <tr key={s.id} className={s.own ? "bg-brand-50" : undefined}>
                    <td>
                      <strong>{s.planNumber}</strong> {s.label}
                      <div className="text-xs text-slate-500">{levelOf.has(s.planNumber) ? `${levelOf.get(s.planNumber)} · ` : ""}{ts(s.type)}{s.own ? ` · ${t("ownSpot")}` : ""}</div>
                    </td>
                    <td>
                      <span className={`badge ${s.state === "free" ? "bg-green-100 text-green-800" : "bg-slate-200 text-slate-700"}`}>
                        {t(s.state === "free" ? "free" : "busy")}
                      </span>
                      {s.state === "free" && s.instant ? <div className="text-xs text-green-700">{t("instant")}</div> : null}
                    </td>
                    <td className="text-xs">
                      {t("perHour", { price: formatEuro(s.pricePerHourCents, locale) })}<br />
                      {t("perDay", { price: formatEuro(s.pricePerDayCents, locale) })}
                    </td>
                    <td>{s.state === "free" ? formatEuro(s.priceCents, locale) : "–"}</td>
                    <td>
                      {s.state === "free" ? (
                        <Link className="btn-primary btn-small" href={`/spots/${s.id}?${qs}`}>
                          {t("request")}<span className="sr-only"> {s.planNumber}</span>
                        </Link>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function SpotDetail({ spot, level, qs, locale }: { spot: SpotState; level?: string; qs: string; locale: string }) {
  const t = useTranslations("map");
  return (
    <div className="space-y-2">
      <h2 className="h2">{spot.planNumber} · {spot.label}</h2>
      {level ? <p className="text-sm text-slate-600">{level}</p> : null}
      <p className="text-2xl font-bold">{formatEuro(spot.priceCents, locale)}</p>
      <p className="text-xs text-slate-500">
        {t("perHour", { price: formatEuro(spot.pricePerHourCents, locale) })} · {t("perDay", { price: formatEuro(spot.pricePerDayCents, locale) })}
      </p>
      {spot.description ? <p className="whitespace-pre-line text-sm">{spot.description}</p> : null}
      <p className="text-sm text-slate-600">{spot.instant ? t("instantInfo") : t("manualInfo")}</p>
      <Link className="btn-primary w-full" href={`/spots/${spot.id}?${qs}`}>{t("request")}</Link>
    </div>
  );
}
