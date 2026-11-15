import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { now } from "@/lib/clock";
import { formatDateTime } from "@/i18n/server";
import { requireAdmin } from "@/lib/auth";
import { ActionButton } from "@/components/ActionButton";
import { deleteUserAction, resendInvitationAction, setLockedAction, updateUserAction } from "@/app/actions/admin";
import { UserForm } from "../../AdminForms";

export default async function AdminUser({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { user: me } = await requireAdmin();
  const t = await getTranslations("admin");
  const locale = await getLocale();
  const u = await prisma.user.findUnique({ where: { id }, include: { spots: true } });
  if (!u || u.status === "DELETED") notFound();
  const open = await prisma.booking.count({
    where: { OR: [{ tenantId: id }, { ownerId: id }], status: { in: ["DRAFT", "REQUESTED", "CONFIRMED"] }, endsAt: { gt: now() } },
  });
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/admin/users" className="text-sm text-brand-700 hover:underline">← {t("users")}</Link>
      <div className="card">
        <h1 className="h1 mb-1">{u.name}</h1>
        <p className="mb-4 text-sm text-slate-600">{t(`userStatus.${u.status}`)} · {t("createdAt", { date: formatDateTime(u.createdAt, locale) })}</p>
        <UserForm action={updateUserAction.bind(null, u.id)} user={u} submitLabel={t("save")} />
      </div>
      <div className="card space-y-3">
        <h2 className="h2">{t("accountActions")}</h2>
        <div className="flex flex-wrap gap-2">
          {u.status === "INVITED" ? <ActionButton action={resendInvitationAction.bind(null, u.id)} label={t("resendInvite")} className="btn-secondary btn-small" /> : null}
          {u.id !== me.id && u.status !== "LOCKED" ? <ActionButton action={setLockedAction.bind(null, u.id, true)} label={t("lock")} className="btn-secondary btn-small" confirmText={t("lockConfirm")} /> : null}
          {u.status === "LOCKED" ? <ActionButton action={setLockedAction.bind(null, u.id, false)} label={t("unlock")} className="btn-secondary btn-small" /> : null}
        </div>
        <div className="border-t border-slate-100 pt-3 text-sm">
          {u.deletionRequestedAt ? <p className="mb-2 text-red-800">{t("deletionRequestedAt", { date: formatDateTime(u.deletionRequestedAt, locale) })}</p> : null}
          <p>{t("deletePreconditions", { open, spots: u.spots.length })}</p>
          {u.id !== me.id ? (
            <div className="mt-2"><ActionButton action={deleteUserAction.bind(null, u.id)} label={t("deleteUser")} className="btn-danger btn-small" confirmText={t("deleteConfirm")} /></div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
