import type { Booking, ParkingSpot, User } from "@prisma/client";
import { prisma } from "./db";
import { sha256 } from "./crypto";
import { fillTemplate } from "./markdown";
import { markdownToPdf } from "./pdf";
import { formatEuro } from "./domain/pricing";
import { formatDate, formatDateTime, translatorFor } from "@/i18n/server";
import { now } from "./clock";

export async function activeTemplate() {
  return prisma.contractTemplate.findFirst({ orderBy: { version: "desc" } });
}

export function contractVars(
  b: Pick<Booking, "id" | "startsAt" | "endsAt" | "priceCents" | "visitorName" | "licensePlate">,
  spot: Pick<ParkingSpot, "planNumber" | "label">,
  owner: Pick<User, "name" | "apartment">,
  tenant: Pick<User, "name" | "apartment">,
  locale: string,
): Record<string, string> {
  return {
    owner_name: owner.name,
    owner_apartment: owner.apartment,
    tenant_name: tenant.name,
    tenant_apartment: tenant.apartment,
    spot_number: spot.planNumber,
    spot_label: spot.label,
    start: formatDateTime(b.startsAt, locale),
    end: formatDateTime(b.endsAt, locale),
    price: formatEuro(b.priceCents, locale),
    visitor_name: b.visitorName || "–",
    license_plate: b.licensePlate || "–",
    booking_id: b.id,
    date: formatDate(now(), locale),
  };
}

/** Contract text for preview (V-03) with the tenant's booking data. */
export async function renderContractText(
  vars: Record<string, string>,
  locale: string,
  version?: number | null,
): Promise<{ text: string; version: number } | null> {
  const tpl = version
    ? await prisma.contractTemplate.findUnique({ where: { version } })
    : await activeTemplate();
  if (!tpl) return null;
  return { text: fillTemplate(locale === "en" ? tpl.bodyEn : tpl.bodyDe, vars), version: tpl.version };
}

/** V-02: creates the immutable PDF contract(s) for a confirmed booking, one per party language. */
export async function createContracts(bookingId: string) {
  const b = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { spot: true, tenant: true, contracts: true },
  });
  const owner = await prisma.user.findUniqueOrThrow({ where: { id: b.ownerId } });
  const locales = Array.from(new Set([b.tenant.locale, owner.locale]));
  const result: Record<string, Buffer> = {};
  for (const locale of locales) {
    const existing = b.contracts.find((c) => c.locale === locale);
    if (existing) {
      result[locale] = Buffer.from(existing.pdf);
      continue;
    }
    const rendered = await renderContractText(contractVars(b, b.spot, owner, b.tenant, locale), locale, b.contractVersion);
    if (!rendered) continue;
    const t = translatorFor(locale, "contract");
    const pdf = await markdownToPdf(rendered.text, {
      title: t("pdfTitle"),
      footer: t("pdfFooter", { id: b.id, version: rendered.version, accepted: b.contractAcceptedAt ? formatDateTime(b.contractAcceptedAt, locale) : "–" }),
    });
    await prisma.contract.create({
      data: { bookingId: b.id, version: rendered.version, locale, pdf: new Uint8Array(pdf), sha256: sha256(pdf) },
    });
    result[locale] = pdf;
  }
  return result;
}
