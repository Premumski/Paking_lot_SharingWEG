import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { ActionButton } from "@/components/ActionButton";
import { deleteSpotAction, saveSpotAction } from "@/app/actions/admin";
import { SpotForm } from "../../AdminForms";

const TYPES = ["STANDARD", "COMPACT", "LARGE", "EV", "MOTORBIKE", "ACCESSIBLE"];

export default async function AdminSpot({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const t = await getTranslations("admin");
  const spot = await prisma.parkingSpot.findUnique({ where: { id } });
  if (!spot) notFound();
  const owners = await prisma.user.findMany({ where: { status: { in: ["ACTIVE", "INVITED"] } }, orderBy: { name: "asc" }, select: { id: true, name: true, apartment: true } });
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/admin/spots" className="text-sm text-brand-700 hover:underline">← {t("spots")}</Link>
      <div className="card">
        <h1 className="h1 mb-3">{spot.planNumber}</h1>
        <SpotForm action={saveSpotAction.bind(null, spot.id)} spot={spot} owners={owners} submitLabel={t("save")} types={TYPES} />
      </div>
      <div className="card">
        <p className="mb-2 text-sm">{t("deleteSpotHint")}</p>
        <ActionButton action={deleteSpotAction.bind(null, spot.id)} label={t("deleteSpot")} className="btn-danger btn-small" confirmText={t("deleteConfirm")} />
      </div>
    </div>
  );
}
