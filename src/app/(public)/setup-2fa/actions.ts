"use server";
import { cookies } from "next/headers";
import { getAuth } from "@/lib/auth";
import { env } from "@/lib/env";

export async function storePendingTotp(secret: string) {
  if (!(await getAuth())) return;
  if (!/^[A-Z2-7]{16,64}$/.test(secret)) return;
  (await cookies()).set("totp_pending", secret, { httpOnly: true, secure: env.secure, sameSite: "strict", path: "/", maxAge: 900 });
}
