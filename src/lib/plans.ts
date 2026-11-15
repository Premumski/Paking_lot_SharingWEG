import { prisma } from "./db";
import { areaIds, planReport } from "./svg";

export interface PlanLevelView {
  id: string;
  name: string;
  svg: string;
  /** IDs of the areas in the plan; spot areas carry the plan number. */
  areaIds: string[];
}

/** K-01: all garage levels in display order. */
export async function loadPlanLevels(): Promise<PlanLevelView[]> {
  const plans = await prisma.garagePlan.findMany({ orderBy: [{ position: "asc" }, { name: "asc" }] });
  return plans.map((p) => ({ id: p.id, name: p.name, svg: p.svg, areaIds: areaIds(p.svg) }));
}

/** Stores the (already sanitized) plan of one level; an existing level keeps its position. */
export async function savePlanLevel(name: string, svg: string, uploadedBy: string | null) {
  const existing = await prisma.garagePlan.findUnique({ where: { name } });
  if (existing) {
    await prisma.garagePlan.update({ where: { id: existing.id }, data: { svg, uploadedBy, uploadedAt: new Date() } });
    return;
  }
  const last = await prisma.garagePlan.aggregate({ _max: { position: true } });
  await prisma.garagePlan.create({ data: { name, svg, uploadedBy, position: (last._max.position ?? -1) + 1 } });
}

/** A-03: spots without an area on any level and areas without a spot. */
export async function checkPlan(levels?: PlanLevelView[]) {
  const [all, spots] = await Promise.all([levels ?? loadPlanLevels(), prisma.parkingSpot.findMany({ select: { planNumber: true } })]);
  return planReport(all.flatMap((l) => l.areaIds), spots.map((s) => s.planNumber));
}
