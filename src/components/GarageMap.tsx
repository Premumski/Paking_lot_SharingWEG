"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

export interface MapLevel {
  name: string;
  svg: string;
  /** Plan numbers of the spot areas on this level */
  planNumbers: string[];
}

export interface MapSpot {
  id: string;
  planNumber: string;
  label: string;
  state: "free" | "busy";
  own: boolean;
}

function findArea(root: HTMLElement, planNumber: string): Element | null {
  const esc = CSS.escape(planNumber);
  return root.querySelector(`[id="${esc}"]`) ?? root.querySelector(`[data-cell-id="${esc}"]`);
}

/** K-02/K-03/K-05: coloured, clickable, zoomable garage plan, one level at a time. */
export function GarageMap({
  levels,
  level,
  onLevel,
  spots,
  selectedId,
  onSelect,
}: {
  levels: MapLevel[];
  /** Name of the level that is shown */
  level: string;
  onLevel: (name: string) => void;
  spots: MapSpot[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations("map");
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const pinch = useRef<{ dist: number; scale: number } | null>(null);
  const active = levels.find((l) => l.name === level) ?? levels[0];
  const svg = active.svg;
  const freeOn = (l: MapLevel) => {
    const numbers = new Set(l.planNumbers);
    return spots.filter((s) => s.state === "free" && numbers.has(s.planNumber)).length;
  };

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const cleanups: (() => void)[] = [];
    for (const s of spots) {
      const el = findArea(root, s.planNumber) as SVGElement | null;
      if (!el) continue;
      el.setAttribute("data-spot", s.planNumber);
      el.setAttribute("data-state", s.state);
      el.setAttribute("data-own", String(s.own));
      el.setAttribute("data-selected", String(s.id === selectedId));
      const label = `${s.planNumber} ${s.label}: ${t(s.state === "free" ? "free" : "busy")}${s.own ? `, ${t("ownSpot")}` : ""}`;
      el.setAttribute("aria-label", label);
      if (s.state === "free") {
        el.setAttribute("role", "button");
        el.setAttribute("tabindex", "0");
        const click = () => onSelect(s.id);
        const key = (e: Event) => {
          const k = (e as KeyboardEvent).key;
          if (k === "Enter" || k === " ") {
            e.preventDefault();
            onSelect(s.id);
          }
        };
        el.addEventListener("click", click);
        el.addEventListener("keydown", key);
        cleanups.push(() => {
          el.removeEventListener("click", click);
          el.removeEventListener("keydown", key);
        });
      } else {
        el.removeAttribute("role");
        el.removeAttribute("tabindex");
      }
    }
    return () => cleanups.forEach((c) => c());
  }, [svg, spots, selectedId, onSelect, t]);

  const clamp = (v: number) => Math.min(4, Math.max(1, v));
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        {levels.length > 1 ? (
          <div className="flex flex-wrap gap-1" role="tablist" aria-label={t("levelSwitch")}>
            {levels.map((l) => (
              <button
                key={l.name}
                type="button"
                role="tab"
                aria-selected={l.name === active.name}
                className={l.name === active.name ? "btn-primary btn-small" : "btn-secondary btn-small"}
                onClick={() => onLevel(l.name)}
              >
                {l.name}
                <span className="font-normal opacity-80">· {t("levelFree", { count: freeOn(l) })}</span>
              </button>
            ))}
          </div>
        ) : <span />}
        <div className="flex gap-1">
          <button type="button" className="btn-secondary btn-small" onClick={() => setScale((s) => clamp(s + 0.5))} aria-label={t("zoomIn")}>+</button>
          <button type="button" className="btn-secondary btn-small" onClick={() => setScale((s) => clamp(s - 0.5))} aria-label={t("zoomOut")}>−</button>
          <button type="button" className="btn-secondary btn-small" onClick={() => setScale(1)} aria-label={t("zoomReset")}>1:1</button>
        </div>
      </div>
      <div
        className="garage-map max-h-[70vh] overflow-auto rounded-lg border border-slate-200 bg-white"
        style={{ touchAction: "pan-x pan-y" }}
        onWheel={(e) => {
          if (!e.ctrlKey) return;
          e.preventDefault();
          setScale((s) => clamp(s - e.deltaY * 0.01));
        }}
        onTouchStart={(e) => {
          if (e.touches.length === 2) {
            const [a, b] = [e.touches[0], e.touches[1]];
            pinch.current = { dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), scale };
          }
        }}
        onTouchMove={(e) => {
          if (e.touches.length === 2 && pinch.current) {
            const [a, b] = [e.touches[0], e.touches[1]];
            const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
            setScale(clamp(pinch.current.scale * (d / pinch.current.dist)));
          }
        }}
        onTouchEnd={() => (pinch.current = null)}
      >
        <div ref={ref} style={{ width: `${scale * 100}%` }} role="img" aria-label={levels.length > 1 ? `${t("mapLabel")}: ${active.name}` : t("mapLabel")} dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
      <ul className="mt-2 flex flex-wrap gap-4 text-xs text-slate-600" aria-label={t("legend")}>
        <li className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded border border-free bg-free-light" />{t("free")}</li>
        <li className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded border border-busy bg-busy-light" />{t("busy")}</li>
        <li className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded border-2 border-dashed border-brand-600" />{t("ownSpot")}</li>
      </ul>
    </div>
  );
}
