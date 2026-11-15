import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "./env";

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hmac(input: string, secret = env.sessionSecret): string {
  return createHmac("sha256", secret).update(input).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** S-05: IPs are never stored in clear text; only a keyed hash of the /24 (/48) prefix. */
export function ipPrefixHash(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const prefix = ip.includes(":") ? ip.split(":").slice(0, 3).join(":") : ip.split(".").slice(0, 3).join(".");
  return hmac(`ip:${prefix}`).slice(0, 16);
}
