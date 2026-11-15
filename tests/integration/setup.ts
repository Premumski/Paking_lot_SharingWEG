import { execSync } from "node:child_process";

/** Applies migrations to TEST_DATABASE_URL before the integration tests. */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return;
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
}
