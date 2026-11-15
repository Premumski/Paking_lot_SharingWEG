import { getTranslations } from "next-intl/server";
import { ActionButton } from "@/components/ActionButton";
import { looksLikePlanNumber } from "@/lib/svg";
import { checkPlan, loadPlanLevels } from "@/lib/plans";
import { createMissingSpotsAction, deletePlanLevelAction, uploadPlanAction } from "@/app/actions/admin";
import { PlanUpload } from "./PlanUpload";

// K-01 / A-03
export default async function AdminPlan() {
  const t = await getTranslations("admin");
  const levels = await loadPlanLevels();
  const report = levels.length ? await checkPlan(levels) : null;
  return (
    <div className="space-y-4">
      <h1 className="h1">{t("plan")}</h1>
      <div className="card space-y-3">
        <p className="text-sm">{t("planHint")}</p>
        <PlanUpload action={uploadPlanAction} levels={levels.map((l) => l.name)} />
      </div>
      {report ? (
        <div className="card space-y-2 text-sm">
          <h2 className="h2">{t("planCheck")}</h2>
          {report.spotsWithoutArea.length === 0 && report.areasWithoutSpot.length === 0 ? <p className="text-green-800">{t("planOk")}</p> : null}
          {report.spotsWithoutArea.length ? <p className="text-red-800">{t("spotsWithoutArea")}: {report.spotsWithoutArea.join(", ")}</p> : null}
          {report.areasWithoutSpot.length ? (
            <>
              <p className="text-amber-800">{t("areasWithoutSpot")}: {report.areasWithoutSpot.join(", ")}</p>
              <p className="hint">{t("createMissingSpotsHint")}</p>
              <ActionButton action={createMissingSpotsAction} label={t("createMissingSpots", { count: report.areasWithoutSpot.length })} className="btn-secondary btn-small" />
            </>
          ) : null}
        </div>
      ) : null}
      {levels.map((level) => (
        <section key={level.id} className="card space-y-3" aria-label={level.name}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="h2">
              {level.name} <span className="text-sm font-normal text-slate-600">· {t("levelAreas", { count: level.areaIds.filter(looksLikePlanNumber).length })}</span>
            </h2>
            <ActionButton
              action={deletePlanLevelAction.bind(null, level.id)}
              label={t("deleteLevel")}
              className="btn-secondary btn-small"
              confirmText={t("deleteLevelConfirm", { level: level.name })}
            />
          </div>
          <div className="garage-map" role="img" aria-label={level.name} dangerouslySetInnerHTML={{ __html: level.svg }} />
        </section>
      ))}
    </div>
  );
}
