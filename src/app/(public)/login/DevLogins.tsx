import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { devLoginAction } from "@/app/actions/dev";

/** Test mode only: one-click login for the seed accounts. */
export async function DevLogins() {
  const t = await getTranslations("dev");
  const users = await prisma.user.findMany({ where: { status: "ACTIVE" }, orderBy: [{ role: "asc" }, { name: "asc" }], take: 12 });
  return (
    <div className="mt-6 rounded-lg border-2 border-dashed border-amber-400 bg-amber-50 p-3">
      <p className="mb-2 text-sm font-semibold text-amber-900">{t("quickLogin")}</p>
      <ul className="space-y-1">
        {users.map((u) => (
          <li key={u.id}>
            <form action={devLoginAction.bind(null, u.id)}>
              <button className="w-full rounded px-2 py-1 text-left text-sm hover:bg-amber-100">
                <strong>{u.name}</strong> <span className="text-xs text-slate-600">· {u.role === "ADMIN" ? "Admin" : u.apartment} · {u.email}</span>
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
