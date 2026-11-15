import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/i18n/server";

const PAGE = 100;

// A-08: read-only audit log
export default async function AdminAudit({ searchParams }: { searchParams: Promise<{ page?: string; action?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(0, Number(sp.page ?? 0) || 0);
  const t = await getTranslations("admin");
  const locale = await getLocale();
  const where = sp.action ? { action: { startsWith: sp.action } } : {};
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { at: "desc" }, skip: page * PAGE, take: PAGE }),
    prisma.auditLog.count({ where }),
  ]);
  const actors = new Map((await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.actorId).filter(Boolean) as string[] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return (
    <div className="space-y-4">
      <h1 className="h1">{t("audit")}</h1>
      <form method="get" className="flex flex-wrap items-end gap-2">
        <div>
          <label className="label" htmlFor="a-action">{t("auditFilter")}</label>
          <select className="input" id="a-action" name="action" defaultValue={sp.action ?? ""}>
            <option value="">{t("all")}</option>
            {["auth.", "user.", "spot.", "availability.", "booking.", "payment.", "settings.", "contract.", "problem.", "admin."].map((a) => <option key={a} value={a}>{a.slice(0, -1)}</option>)}
          </select>
        </div>
        <button className="btn-secondary btn-small">{t("filter")}</button>
      </form>
      <p className="hint">{t("auditRetention")}</p>
      <div className="card overflow-x-auto p-0 sm:p-0">
        <table className="table text-xs">
          <thead><tr><th>{t("when")}</th><th>{t("who")}</th><th>{t("what")}</th><th>{t("object")}</th><th>{t("details")}</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap">{formatDateTime(r.at, locale)}</td>
                <td>{r.actorId ? actors.get(r.actorId) ?? r.actorId.slice(0, 8) : t("system")}</td>
                <td className="font-mono">{r.action}</td>
                <td>{r.entityType ? `${r.entityType} ${r.entityId?.slice(0, 8) ?? ""}` : ""}</td>
                <td className="max-w-xs break-all font-mono">{r.details ? JSON.stringify(r.details) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        {page > 0 ? <Link className="btn-secondary btn-small" href={`/admin/audit?page=${page - 1}${sp.action ? `&action=${sp.action}` : ""}`}>←</Link> : null}
        {(page + 1) * PAGE < total ? <Link className="btn-secondary btn-small" href={`/admin/audit?page=${page + 1}${sp.action ? `&action=${sp.action}` : ""}`}>→</Link> : null}
        <span className="text-sm text-slate-600">{t("entries", { total })}</span>
      </div>
    </div>
  );
}
