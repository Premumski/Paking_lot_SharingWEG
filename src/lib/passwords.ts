import { hash, verify } from "@node-rs/argon2";
import { createHash } from "node:crypto";
import { env } from "./env";

// S-02: Argon2id (algorithm 2) with OWASP recommended parameters.
const OPTIONS = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string) {
  return hash(password, OPTIONS);
}

export async function verifyPassword(hashValue: string | null | undefined, password: string) {
  if (!hashValue) {
    // Burn comparable time so the response does not reveal whether the account exists.
    await hash(password, OPTIONS);
    return false;
  }
  try {
    return await verify(hashValue, password);
  } catch {
    return false;
  }
}

const COMMON = new Set([
  "123456789012", "password1234", "passwort1234", "qwertzuiop12", "qwertyuiop12", "111111111111",
  "123456123456", "iloveyou1234", "passwordpassword", "hallohallo12", "123456789abc", "abcdefghijkl",
  "000000000000", "1234567890123", "letmein12345", "willkommen12", "sommer2024!!", "fussball1234",
]);

export type PasswordProblem = "tooShort" | "tooLong" | "leaked";

/** R-03: at least 12 characters, checked against known leaked passwords (HIBP k-anonymity). */
export async function checkPasswordPolicy(password: string): Promise<PasswordProblem | null> {
  if (password.length < 12) return "tooShort";
  if (password.length > 256) return "tooLong";
  if (COMMON.has(password.toLowerCase())) return "leaked";
  if (!env.hibpEnabled) return null;
  try {
    const sha1 = createHash("sha1").update(password).digest("hex").toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true" },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const body = await res.text();
    for (const line of body.split("\n")) {
      const [s, count] = line.trim().split(":");
      if (s === suffix && Number(count) > 0) return "leaked";
    }
  } catch {
    // Fail open: the service being unreachable must not block password changes.
  }
  return null;
}
