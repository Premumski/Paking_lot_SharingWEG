/**
 * Q-05 seed data: our garage with its two levels (docs/plans, built from Lageplan.drawio by
 * `npm run plan:build`) and all 64 spots. Ten spots (501–505 on UG -1, 525–529 on UG -2) belong to
 * the 5 test residents and come with rules and bookings in different states; the other spots have
 * no owner yet. Plus 1 admin.
 * WARNING: wipes all data. Refuses to run in production unless SEED_FORCE=true.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";
import { looksLikePlanNumber, sanitizeSvg } from "../src/lib/svg";
import { addLocalDays, ceilToSlot, fromLocal, HOUR, toLocalParts } from "../src/lib/domain/time";
import { calculatePriceCents, estimateFeeCents } from "../src/lib/domain/pricing";

const prisma = new PrismaClient();
export const SEED_PASSWORD = "Stellplatz-Test-2026!";
export const ADMIN_TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DP";
const PLAN_LEVELS = [
  { name: "UG -1", file: "ug-1.svg" },
  { name: "UG -2", file: "ug-2.svg" },
];

const CONTRACT_DE = `# Stellplatz-Mietvertrag

Zwischen **{{owner_name}}** (Wohnung {{owner_apartment}}), im Folgenden „Vermieter“, und **{{tenant_name}}** (Wohnung {{tenant_apartment}}), im Folgenden „Mieter“, wird folgender Vertrag geschlossen:

## 1. Mietgegenstand
Vermietet wird der Tiefgaragenstellplatz **{{spot_number}}** ({{spot_label}}) zum Abstellen eines Kraftfahrzeugs. Kennzeichen: {{license_plate}}. Besuch: {{visitor_name}}.

## 2. Mietzeit
Von **{{start}}** bis **{{end}}**. Der Platz ist zum Ende pünktlich und geräumt zurückzugeben.

## 3. Miete
Die Miete beträgt **{{price}}** und ist mit der Zusage fällig. Die Zahlung erfolgt über den Zahlungsdienstleister der App.

## 4. Stornierung
Der Mieter kann bis zum Beginn jederzeit kostenlos stornieren und erhält den vollen Betrag zurück. Storniert der Vermieter vor Beginn, erhält der Mieter ebenfalls den vollen Betrag zurück.

## 5. Pflichten
- Es gelten die Hausordnung und die Garagenordnung der Wohnanlage.
- Untervermietung und Lagerung von Gegenständen sind nicht gestattet.
- Schäden sind unverzüglich über die App zu melden.

## 6. Haftung
Der Mieter haftet für Schäden, die er oder sein Besuch schuldhaft verursacht. Der Vermieter haftet nur für Vorsatz und grobe Fahrlässigkeit.

Buchungsnummer: {{booking_id}} · Erstellt am {{date}}

**Hinweis:** Diese Vorlage ist ein Muster und vor dem Livegang rechtlich zu prüfen.`;

const CONTRACT_EN = `# Parking Space Rental Contract

Between **{{owner_name}}** (apartment {{owner_apartment}}), hereinafter "landlord", and **{{tenant_name}}** (apartment {{tenant_apartment}}), hereinafter "tenant", the following contract is concluded:

## 1. Subject
The underground parking space **{{spot_number}}** ({{spot_label}}) is rented for parking a motor vehicle. Licence plate: {{license_plate}}. Visitor: {{visitor_name}}.

## 2. Rental period
From **{{start}}** to **{{end}}**. The space must be vacated on time at the end.

## 3. Rent
The rent is **{{price}}** and is due on confirmation. Payment is made via the app's payment provider.

## 4. Cancellation
The tenant may cancel free of charge at any time until the start and receives the full amount back. If the landlord cancels before the start, the tenant also receives the full amount back.

## 5. Obligations
- The house rules and garage rules of the residential complex apply.
- Subletting and storing items are not permitted.
- Damage must be reported immediately via the app.

## 6. Liability
The tenant is liable for damage culpably caused by them or their visitor. The landlord is only liable for intent and gross negligence.

Booking number: {{booking_id}} · Created on {{date}}

**Note:** This template is a sample and must be legally reviewed before going live.`;

const IMPRINT_DE = `# Impressum

Angaben gemäß § 5 DDG

**WEG Musterstraße 12**, vertreten durch die Verwaltung
Musterstraße 12, 12345 Musterstadt

E-Mail: verwaltung@example.org

*Platzhalter – bitte im Admin-Bereich anpassen.*`;
const IMPRINT_EN = `# Legal notice

**WEG Musterstraße 12**, represented by the property management
Musterstraße 12, 12345 Musterstadt, Germany

E-mail: verwaltung@example.org

Placeholder – please adjust in the admin area.`;
const PRIVACY_DE = `# Datenschutzerklärung

## Verantwortlicher
WEG Musterstraße 12, vertreten durch die Verwaltung, verwaltung@example.org

## Welche Daten wir verarbeiten
- Name, E-Mail, Wohnung, optional Telefonnummer
- Buchungen, Freigaben, Problemmeldungen
- Zahlungsstatus (Karten- und Kontodaten verarbeitet ausschließlich Stripe)
- Technische Sitzungsdaten (Browser, Zeitpunkt), keine IP-Adressen im Klartext

## Zweck und Rechtsgrundlage
Vermittlung von Stellplätzen unter Bewohnern (Art. 6 Abs. 1 lit. b DSGVO).

## Empfänger
Hetzner Online GmbH (Hosting, Deutschland), Stripe Payments Europe Ltd. (Zahlungen), E-Mail-Anbieter.

## Speicherdauer
Buchungsdaten bis zum Ablauf gesetzlicher Aufbewahrungsfristen, Audit-Log 2 Jahre, Server-Logs 30 Tage.

## Deine Rechte
Auskunft (Datenexport im Profil), Berichtigung, Löschung (Antrag im Profil), Einschränkung, Widerspruch, Beschwerde bei der Aufsichtsbehörde.

*Platzhalter – vor dem Livegang rechtlich prüfen.*`;
const PRIVACY_EN = `# Privacy policy

## Controller
WEG Musterstraße 12, represented by the property management, verwaltung@example.org

## Data we process
- Name, e-mail, apartment, optional phone number
- Bookings, releases, problem reports
- Payment status (card and bank data are processed exclusively by Stripe)
- Technical session data (browser, time), no plain-text IP addresses

## Purpose and legal basis
Arranging parking spaces between residents (Art. 6(1)(b) GDPR).

## Recipients
Hetzner Online GmbH (hosting, Germany), Stripe Payments Europe Ltd. (payments), e-mail provider.

## Retention
Booking data until statutory retention periods expire, audit log 2 years, server logs 30 days.

## Your rights
Access (data export in your profile), rectification, erasure (request in your profile), restriction, objection, complaint to the supervisory authority.

Placeholder – review legally before going live.`;

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.SEED_FORCE !== "true") {
    throw new Error("Refusing to seed in production (set SEED_FORCE=true to override).");
  }
  console.log("Seeding … (all existing data is removed)");
  await prisma.$executeRawUnsafe(
    `TRUNCATE "ProblemPhoto","ProblemReport","Contract","Payment","PaymentCustomer","Booking","Blocking","AvailabilityRule","ParkingSpot","PushSubscription","Token","Session","RateLimit","WebhookEvent","ContractTemplate","LegalPage","GaragePlan","DevMail","AuditLog","Settings","User" CASCADE`,
  );

  await prisma.settings.create({ data: { id: 1 } });
  const passwordHash = await hash(SEED_PASSWORD, { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 });

  const admin = await prisma.user.create({
    data: {
      email: "admin@example.org", name: "Verena Verwaltung", apartment: "Verwaltung", role: "ADMIN", status: "ACTIVE",
      passwordHash, totpSecret: ADMIN_TOTP_SECRET, totpEnabled: true, phone: "+49 30 1234560",
    },
  });
  const mk = (email: string, name: string, apartment: string, extra: Record<string, unknown> = {}) =>
    prisma.user.create({ data: { email, name, apartment, status: "ACTIVE", passwordHash, ...extra } });
  const anna = await mk("anna@example.org", "Anna Bauer", "W 1.01", { phone: "+49 170 1111111", paymentAccountId: "acct_mock_anna", paymentOnboarded: true });
  const ben = await mk("ben@example.org", "Ben Schmidt", "W 1.02", { phone: "+49 170 2222222", paymentAccountId: "acct_mock_ben", paymentOnboarded: true, locale: "en" });
  const clara = await mk("clara@example.org", "Clara Weber", "W 2.01", { phone: "+49 170 3333333" });
  const david = await mk("david@example.org", "David Müller", "W 2.02", { phone: "+49 170 4444444" });
  const emma = await mk("emma@example.org", "Emma Fischer", "W 3.01", { phone: "+49 170 5555555" });
  // An invited account for testing the invitation flow
  await prisma.user.create({ data: { email: "neu@example.org", name: "Noah Neumann", apartment: "W 3.02", status: "INVITED" } });

  const t0 = new Date();
  const today = toLocalParts(t0);
  const midnight = fromLocal(today.year, today.month, today.day);

  const spotData = [
    { planNumber: "501", label: "Nähe Treppenhaus", ownerId: anna.id, pricePerHourCents: 200, pricePerDayCents: 1200, description: "Breiter Platz direkt am Treppenhaus.", accessNotes: "Tor mit Transponder; Ersatz-Transponder im Briefkasten W 1.01.", type: "STANDARD" },
    { planNumber: "502", label: "Mitte", ownerId: anna.id, pricePerHourCents: 150, pricePerDayCents: 1000, description: "Normaler Platz, gut anzufahren.", accessNotes: "Bitte rückwärts einparken.", instantBooking: true, instantMaxMinutes: 240, type: "COMPACT" },
    { planNumber: "503", label: "Mit Wallbox", ownerId: ben.id, pricePerHourCents: 200, pricePerDayCents: 1500, description: "Mit 11-kW-Wallbox (Laden nach Absprache).", accessNotes: "Wallbox-Karte hängt am Pfeiler.", instantBooking: true, instantMaxMinutes: 1440, type: "EV" },
    { planNumber: "504", label: "Groß", ownerId: ben.id, pricePerHourCents: 100, pricePerDayCents: 800, description: "Extra lang, passt für Transporter.", accessNotes: "Rolltor rechts nutzen.", type: "LARGE" },
    { planNumber: "505", label: "Kostenlos", ownerId: clara.id, description: "Gerne kostenlos für Nachbarn.", accessNotes: "Keine Besonderheiten.", instantBooking: true, instantMaxMinutes: 365 * 1440, type: "STANDARD" },
    { planNumber: "525", label: "Hinten links", ownerId: clara.id, description: "Ruhiger Platz.", accessNotes: "Licht-Taster links neben dem Tor.", type: "STANDARD" },
    { planNumber: "526", label: "Nachts frei", ownerId: david.id, description: "Werktags über Nacht frei.", accessNotes: "Bis 08:00 Uhr räumen.", type: "STANDARD" },
    { planNumber: "527", label: "Pausiert", ownerId: david.id, description: "Derzeit pausiert.", paused: true, type: "COMPACT" },
    { planNumber: "528", label: "Motorrad", ownerId: david.id, type: "MOTORBIKE" },
    { planNumber: "529", label: "Barrierefrei", ownerId: david.id, type: "ACCESSIBLE" },
  ] as const;
  const spots: Record<string, string> = {};
  for (const s of spotData) {
    const created = await prisma.parkingSpot.create({ data: { ...s } });
    spots[s.planNumber] = created.id;
  }

  // Garage plan: one SVG per level; every remaining spot area becomes a spot without owner.
  const planDir = path.join(process.cwd(), "docs", "plans");
  for (const [position, level] of PLAN_LEVELS.entries()) {
    const { svg, ids } = sanitizeSvg(fs.readFileSync(path.join(planDir, level.file), "utf8"));
    await prisma.garagePlan.create({ data: { name: level.name, position, svg, uploadedBy: admin.id } });
    const missing = ids.filter((id) => looksLikePlanNumber(id) && !(id in spots));
    await prisma.parkingSpot.createMany({ data: missing.map((planNumber) => ({ planNumber, label: "Stellplatz" })) });
  }
  const spotCount = await prisma.parkingSpot.count();
  const rule = (planNumber: string, data: Record<string, unknown>) =>
    prisma.availabilityRule.create({ data: { spotId: spots[planNumber], startsAt: midnight, weekdays: [], ...data } as never });
  await rule("501", { kind: "WEEKLY", weekdays: [1, 2, 3, 4, 5], startMin: 8 * 60, endMin: 18 * 60 });
  await rule("502", { kind: "ALWAYS" });
  await rule("503", { kind: "ALWAYS" });
  await rule("504", { kind: "WEEKENDS" });
  await rule("505", { kind: "ALWAYS" });
  await rule("525", { kind: "MANUAL", startsAt: midnight, endsAt: addLocalDays(midnight, 7) });
  await rule("526", { kind: "WEEKLY", weekdays: [1, 2, 3, 4, 5], startMin: 18 * 60, endMin: 8 * 60 });
  await rule("527", { kind: "ALWAYS" });
  await prisma.blocking.create({
    data: { spotId: spots["502"], startsAt: fromLocal(today.year, today.month, today.day + 3, 0, 0), endsAt: fromLocal(today.year, today.month, today.day + 4, 0, 0), note: "Selbst genutzt" },
  });

  const tpl = await prisma.contractTemplate.create({ data: { version: 1, bodyDe: CONTRACT_DE, bodyEn: CONTRACT_EN, createdBy: admin.id } });
  await prisma.legalPage.create({ data: { key: "imprint", bodyDe: IMPRINT_DE, bodyEn: IMPRINT_EN } });
  await prisma.legalPage.create({ data: { key: "privacy", bodyDe: PRIVACY_DE, bodyEn: PRIVACY_EN } });

  // Bookings in different states
  const tomorrow = (h: number, d = 1) => fromLocal(today.year, today.month, today.day + d, h, 0);
  const priceOf = (planNumber: string, start: Date, end: Date) => {
    const s = spotData.find((x) => x.planNumber === planNumber)!;
    return calculatePriceCents(end.getTime() - start.getTime(), "pricePerHourCents" in s ? s.pricePerHourCents : 0, "pricePerDayCents" in s ? s.pricePerDayCents : 0);
  };
  const book = async (planNumber: string, tenantId: string, ownerId: string, start: Date, end: Date, data: Record<string, unknown>) => {
    const priceCents = priceOf(planNumber, start, end);
    return prisma.booking.create({
      data: {
        spotId: spots[planNumber], tenantId, ownerId, startsAt: start, endsAt: end, priceCents, contractVersion: tpl.version,
        contractAcceptedAt: new Date(t0.getTime() - HOUR), requestedAt: new Date(t0.getTime() - HOUR), ...data,
      } as never,
    });
  };

  // 1) Emma -> 502 tomorrow 10-12, confirmed & paid by card
  const b1 = await book("502", emma.id, anna.id, tomorrow(10), tomorrow(12), {
    status: "CONFIRMED", decidedAt: t0, paymentStatus: "PAID", paymentMethodRef: "card_ok", paymentMethodType: "card", visitorName: "Oma Fischer", licensePlate: "M-EF 123",
  });
  await prisma.payment.create({ data: { bookingId: b1.id, provider: "mock", providerRef: `pi_mock_seed_${b1.id.slice(0, 8)}`, amountCents: b1.priceCents, feeCents: estimateFeeCents(b1.priceCents, "card"), status: "PAID", methodType: "card", paidAt: t0 } });

  // 2) Ben -> 502 tomorrow 13-19 (6 h > instant threshold of 4 h) -> waiting for Anna's decision
  await book("502", ben.id, anna.id, tomorrow(13), tomorrow(19), {
    status: "REQUESTED", paymentStatus: "METHOD_SAVED", paymentMethodRef: "card_ok", paymentMethodType: "card",
    expiresAt: new Date(Math.min(tomorrow(13).getTime(), t0.getTime() + 48 * HOUR)),
  });

  // 3) Emma -> 505 yesterday, completed, free
  const yStart = fromLocal(today.year, today.month, today.day - 1, 9, 0);
  await book("505", emma.id, clara.id, yStart, new Date(yStart.getTime() + 5 * HOUR), { status: "CONFIRMED", decidedAt: yStart, instant: true });

  // 4) Clara -> 503 in 3 days, cancelled by owner Ben, refunded
  const b4 = await book("503", clara.id, ben.id, tomorrow(14, 3), tomorrow(18, 3), {
    status: "CANCELLED", cancelledBy: "OWNER", cancelReason: "Brauche den Platz selbst", cancelledAt: t0, paymentStatus: "REFUNDED", paymentMethodType: "card",
  });
  await prisma.payment.create({ data: { bookingId: b4.id, provider: "mock", providerRef: `pi_mock_seed_${b4.id.slice(0, 8)}`, amountCents: b4.priceCents, feeCents: estimateFeeCents(b4.priceCents, "card"), status: "REFUNDED", methodType: "card", paidAt: t0, refundedAt: t0 } });

  // 5) David -> 503 currently running (started 1h ago, ends in 3 h) – extension can be tested by David
  const runStart = ceilToSlot(new Date(t0.getTime() - 2 * HOUR));
  const b5 = await book("503", david.id, ben.id, runStart, new Date(runStart.getTime() + 4 * HOUR), {
    status: "CONFIRMED", decidedAt: runStart, instant: true, paymentStatus: "PAID", paymentMethodRef: "card_ok", paymentMethodType: "card", reminderStartSent: true,
  });
  await prisma.payment.create({ data: { bookingId: b5.id, provider: "mock", providerRef: `pi_mock_seed_${b5.id.slice(0, 8)}`, amountCents: b5.priceCents, feeCents: estimateFeeCents(b5.priceCents, "card"), status: "PAID", methodType: "card", paidAt: runStart } });

  // Contracts for confirmed bookings
  const { createContracts } = await import("../src/lib/contracts");
  for (const b of [b1, b5]) await createContracts(b.id);

  await prisma.auditLog.create({ data: { action: "seed.completed", actorId: null, details: { users: 7, spots: spotCount } } });
  console.log(`Done. Password for all seed accounts: ${SEED_PASSWORD}`);
  console.log(`Admin TOTP secret: ${ADMIN_TOTP_SECRET} (or run: npm run dev:totp)`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
