import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { saveSpotAction } from "@/app/actions/admin";
import { SpotForm } from "../AdminForms";

const TYPES = ["STANDARD", "COMPACT", "LARGE", "EV", "MOTORBIKE", "ACCESSIBLE"];

export default async function AdminSpots() {
  const t = await getTranslations("admin");
  const ts = await getTranslations("spotTypes");
  const [spots, owners, cancellations] = await Promise.all([
    prisma.parkingSpot.findMany({ orderBy: { planNumber: "asc" }, include: { owner: true } }),
    prisma.user.findMany({ where: { status: { in: ["ACTIVE", "INVITED"] } }, orderBy: { name: "asc" }, select: { id: true, name: true, apartment: true } }),
    // B-07: number of owner cancellations per spot
    prisma.booking.groupBy({ by: ["spotId"], where: { status: "CANCELLED", cancelledBy: "OWNER" }, _count: { _all: true } }),
  ]);
  const cancelMap = new Map(cancellations.map((c) => [c.spotId, c._count._all]));
  return (
    <div className="space-y-4">
      <h1 className="h1">{t("spots")}</h1>
      <div className="card"><h2 className="h2 mb-3">{t("newSpot")}</h2><SpotForm action={saveSpotAction.bind(null, null)} owners={owners} submitLabel={t("create")} types={TYPES} /></div>
      <div className="card overflow-x-auto p-0 sm:p-0">
        <table className="table">
          <thead><tr><th>{t("planNumber")}</th><th>{t("label")}</th><th>{t("type")}</th><th>{t("owner")}</th><th>{t("ownerCancellations")}</th></tr></thead>
          <tbody>
            {spots.map((s) => (
              <tr key={s.id}>
                <td><Link className="text-brand-700 underline" href={`/admin/spots/${s.id}`}>{s.planNumber}</Link></td>
                <td>{s.label}</td>
                <td>{ts(s.type)}</td>
                <td>{s.owner ? `${s.owner.name} (${s.owner.apartment})` : <span className="text-amber-700">{t("noOwner")}</span>}</td>
                <td>{cancelMap.get(s.id) ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
