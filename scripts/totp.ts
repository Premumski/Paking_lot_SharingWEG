/** Prints the current TOTP code for the seeded admin (test setup only). */
import { authenticator } from "otplib";
const secret = process.argv[2] ?? "JBSWY3DPEHPK3PXPJBSWY3DP";
console.log(authenticator.generate(secret));
