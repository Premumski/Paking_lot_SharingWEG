/** Errors carrying a translation key (namespace "errors") for the UI. */
export class AppError extends Error {
  constructor(
    public key: string,
    public params: Record<string, string | number> = {},
  ) {
    super(key);
  }
}

export type ActionResult =
  | { ok: true; message?: string; params?: Record<string, string | number>; redirect?: string; data?: unknown }
  | { ok: false; error: string; params?: Record<string, string | number>; data?: unknown };

export function toActionError(e: unknown): ActionResult {
  if (e instanceof AppError) return { ok: false, error: e.key, params: e.params };
  // Next.js redirects/notFound must propagate
  if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_")) throw e;
  console.error("[action]", e);
  return { ok: false, error: "unexpected" };
}

export function isOverlapViolation(e: unknown): boolean {
  const msg = String((e as Error)?.message ?? "");
  return msg.includes("Booking_no_overlap") || msg.includes("23P01");
}
