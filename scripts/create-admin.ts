/**
 * Creates the first admin account and sends the invitation (R-02). Usage:
 *   docker compose run --rm migrate npx tsx scripts/create-admin.ts "Name" email@example.org "Wohnung/Verwaltung"
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { sendInvitation } from "../src/lib/invitations";
import { audit } from "../src/lib/audit";

async function main() {
  const [name, emailRaw, apartment = "Verwaltung"] = process.argv.slice(2);
  const email = emailRaw?.trim().toLowerCase();
  if (!name || !email || !/^[^@\s]+@[^@\s]+$/.test(email)) {
    console.error('Usage: npx tsx scripts/create-admin.ts "Name" email@example.org "Wohnung"');
    process.exit(1);
  }
  if (await prisma.user.findUnique({ where: { email } })) throw new Error("E-mail already exists");
  await prisma.settings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  const user = await prisma.user.create({ data: { name, email, apartment, role: "ADMIN", status: "INVITED" } });
  const url = await sendInvitation(user);
  await audit("user.created", { entityType: "User", entityId: user.id, details: { role: "ADMIN", via: "cli" } });
  console.log(`Admin created. Invitation e-mail to ${email} was handed to SMTP (see errors above, if any).\nIf the e-mail does not arrive, open this link (valid 72 h, single use):\n${url}`);
}

main().finally(() => prisma.$disconnect());
