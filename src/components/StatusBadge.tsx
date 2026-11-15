import { getTranslations } from "next-intl/server";
import type { DisplayStatus } from "@/lib/booking/visibility";

const COLORS: Record<DisplayStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  requested: "bg-amber-100 text-amber-900",
  confirmed: "bg-green-100 text-green-800",
  active: "bg-brand-100 text-brand-800",
  completed: "bg-slate-200 text-slate-700",
  declined: "bg-red-100 text-red-800",
  withdrawn: "bg-slate-100 text-slate-700",
  expired: "bg-slate-100 text-slate-700",
  cancelled: "bg-red-100 text-red-800",
};

export async function StatusBadge({ status }: { status: DisplayStatus }) {
  const t = await getTranslations("status");
  return <span className={`badge ${COLORS[status]}`}>{t(status)}</span>;
}

export async function PaymentBadge({ status }: { status: string }) {
  const t = await getTranslations("paymentStatus");
  if (status === "NONE") return null;
  const color =
    status === "PAID" ? "bg-green-100 text-green-800" : status === "FAILED" ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-700";
  return <span className={`badge ${color}`}>{t(status)}</span>;
}
