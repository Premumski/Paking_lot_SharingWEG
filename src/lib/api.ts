import { getAuth } from "./auth";

export async function apiUser() {
  const a = await getAuth();
  return a && a.session.mfaVerified ? a.user : null;
}

export function csvEscape(v: unknown): string {
  let s = v == null ? "" : String(v);
  // Prevent CSV/formula injection in spreadsheet apps.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: unknown[][]): string {
  return "﻿" + rows.map((r) => r.map(csvEscape).join(";")).join("\r\n");
}

export const noStore = { "Cache-Control": "no-store" };
