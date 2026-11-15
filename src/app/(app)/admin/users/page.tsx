import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { createUserAction, importUsersAction } from "@/app/actions/admin";
import { ImportForm, UserForm } from "../AdminForms";

export default async function AdminUsers() {
  const t = await getTranslations("admin");
  const users = await prisma.user.findMany({ where: { status: { not: "DELETED" } }, orderBy: [{ apartment: "asc" }, { name: "asc" }], include: { _count: { select: { spots: true } } } });
  return (
    <div className="space-y-4">
      <h1 className="h1">{t("users")}</h1>
      <div className="card"><h2 className="h2 mb-3">{t("newUser")}</h2><UserForm action={createUserAction} submitLabel={t("createAndInvite")} /></div>
      <details className="card"><summary className="cursor-pointer font-semibold">{t("csvImport")}</summary><div className="mt-3"><ImportForm action={importUsersAction} /></div></details>
      <div className="card overflow-x-auto p-0 sm:p-0">
        <table className="table">
          <thead><tr><th>{t("name")}</th><th>{t("apartment")}</th><th className="hidden sm:table-cell">{t("email")}</th><th>{t("role")}</th><th>{t("status")}</th><th>{t("spots")}</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td><Link className="text-brand-700 underline" href={`/admin/users/${u.id}`}>{u.name}</Link>{u.deletionRequestedAt ? <span className="badge ml-1 bg-red-100 text-red-800">{t("deletionRequested")}</span> : null}</td>
                <td>{u.apartment}</td>
                <td className="hidden sm:table-cell">{u.email}</td>
                <td>{t(`roles.${u.role}`)}{u.role === "ADMIN" && !u.totpEnabled ? <span className="block text-xs text-amber-700">{t("no2fa")}</span> : null}</td>
                <td>{t(`userStatus.${u.status}`)}</td>
                <td>{u._count.spots}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
