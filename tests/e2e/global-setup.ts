import { execSync } from "node:child_process";

export default async function globalSetup() {
  if (process.env.E2E_SKIP_SEED === "1") return;
  execSync("npx tsx prisma/seed.ts", { stdio: "inherit" });
}
