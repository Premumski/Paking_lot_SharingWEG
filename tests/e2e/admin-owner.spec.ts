import path from "node:path";
import { expect, test } from "@playwright/test";
import { ADMIN_TOTP, berlinDate, loginAs, openRequestFor, reloadUntil, searchPeriod } from "./helpers";

test("S-03: account is locked after 5 failed logins", async ({ page }) => {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  for (let i = 0; i < 6; i++) {
    await page.getByLabel(/E-Mail/).fill("neu@example.org");
    await page.getByLabel(/^Passwort$/).fill(`wrong-password-${i}`);
    await page.getByRole("button", { name: "Anmelden" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /falsch|Zu viele/ })).toBeVisible();
  }
  await expect(page.getByText(/Zu viele Versuche/)).toBeVisible();
});

test("admin: CSV import, plan upload, time rules and contract template", async ({ browser }) => {
  const admin = await loginAs(browser, "admin@example.org", { totp: ADMIN_TOTP });
  await admin.goto("/admin/users");
  await admin.waitForLoadState("networkidle");
  await admin.getByText("CSV-Import für die Erstbefüllung").click();
  await admin.getByLabel("oder CSV-Text einfügen").fill("name;email;apartment\nIda Import;ida@example.org;W 5.01\nKaputt;keine-mail;W 5.02");
  await admin.getByRole("button", { name: "Importieren" }).click();
  await expect(admin.getByText("1 Konten angelegt, 1 übersprungen.")).toBeVisible();

  await admin.goto("/admin/plan");
  await admin.waitForLoadState("networkidle");
  // K-01: both levels come from the seed; uploading a level again replaces its plan.
  await expect(admin.getByRole("heading", { name: /UG -1 · 24 Platzflächen/ })).toBeVisible();
  await expect(admin.getByRole("heading", { name: /UG -2 · 40 Platzflächen/ })).toBeVisible();
  await admin.getByLabel("Plan-Datei (SVG oder Draw.io)").setInputFiles(path.join(process.cwd(), "docs", "plans", "ug-1.svg"));
  await admin.getByLabel("Name der Ebene").fill("UG -1");
  await admin.getByRole("button", { name: "Hochladen" }).click();
  await expect(admin.getByText("Plan gespeichert (UG -1). 0 Plätze ohne Fläche, 0 Flächen ohne Platz.")).toBeVisible();
  await expect(admin.getByRole("heading", { name: /^UG -/ })).toHaveCount(2);

  await admin.goto("/admin/settings");
  await admin.waitForLoadState("networkidle");
  // out-of-range values are blocked in the browser (max=20) and again on the server
  await admin.getByLabel(/Offene Anfragen je Bewohner/).fill("25");
  expect(await admin.getByLabel(/Offene Anfragen je Bewohner/).evaluate((el) => (el as HTMLInputElement).validity.rangeOverflow)).toBe(true);
  await admin.getByLabel(/Offene Anfragen je Bewohner/).fill("6");
  await admin.getByRole("button", { name: "Speichern" }).click();
  await expect(admin.getByText("Gespeichert.")).toBeVisible();

  await admin.goto("/admin/content");
  await admin.waitForLoadState("networkidle");
  const de = admin.getByLabel("Deutsch").first();
  await de.fill((await de.inputValue()) + "\n\n## 7. Zusatz\nTestklausel.");
  await admin.getByRole("button", { name: "Speichern" }).first().click();
  await expect(admin.getByText("Vertragsvorlage Version 2 gespeichert.")).toBeVisible();
});

test("admin: create missing spots from the plan, remove a level and upload it again (K-01, A-02, A-03)", async ({ browser }) => {
  const admin = await loginAs(browser, "admin@example.org", { totp: ADMIN_TOTP });
  admin.on("dialog", (d) => d.accept());
  await admin.goto("/admin/spots");
  await admin.getByRole("link", { name: "564", exact: true }).click();
  await admin.waitForLoadState("networkidle");
  await admin.getByRole("button", { name: "Platz löschen" }).click();
  await admin.waitForURL(/\/admin\/spots$/);

  await admin.goto("/admin/plan");
  await admin.waitForLoadState("networkidle");
  await expect(admin.getByText("Flächen ohne Platz: 564")).toBeVisible();
  await admin.getByRole("button", { name: "1 fehlenden Platz anlegen" }).click();
  await expect(admin.getByText("Alle Plätze haben eine Fläche, alle Flächen einen Platz.")).toBeVisible();

  await admin.getByRole("region", { name: "UG -2" }).getByRole("button", { name: "Ebene entfernen" }).click();
  await expect(admin.getByText(/Plätze ohne Fläche im Plan: 525, 526/)).toBeVisible();
  await expect(admin.getByRole("heading", { name: /^UG -/ })).toHaveCount(1);
  await admin.getByLabel("Plan-Datei (SVG oder Draw.io)").setInputFiles(path.join(process.cwd(), "docs", "plans", "ug-2.svg"));
  await admin.getByLabel("Name der Ebene").fill("UG -2");
  await admin.getByRole("button", { name: "Hochladen" }).click();
  await expect(admin.getByText("Plan gespeichert (UG -2). 0 Plätze ohne Fläche, 0 Flächen ohne Platz.")).toBeVisible();
  await expect(admin.getByRole("heading", { name: /UG -2 · 40 Platzflächen/ })).toBeVisible();
});

test("owner: onboarding, price, rule and pause (Z-03, P-05, P-08)", async ({ browser }) => {
  const david = await loginAs(browser, "david@example.org");
  await david.goto("/earnings");
  await david.waitForLoadState("networkidle");
  await david.getByRole("button", { name: "Konto verbinden" }).click();
  await david.waitForURL(/mock-pay\?mode=onboarding/);
  await david.getByRole("button", { name: "Onboarding abschließen" }).click();
  await david.waitForURL(/\/earnings\?onboarding=done/);
  await reloadUntil(david, /Konto verwalten/);

  await david.goto("/my-spots");
  await david.getByRole("listitem").filter({ hasText: "528" }).getByRole("link", { name: "Verwalten" }).click();
  await david.waitForURL(/\/my-spots\/.+/);
  await david.waitForLoadState("networkidle");
  await david.getByLabel("Preis pro Stunde (€)").fill("1,00");
  await david.getByLabel("Preis pro Tag (€)").fill("5,00");
  await expect(david.getByText(/Du erhältst ca\./).first()).toBeVisible();
  await david.getByRole("button", { name: "Speichern" }).click();
  await expect(david.getByText("Gespeichert.")).toBeVisible();

  await david.getByLabel("Art").selectOption("ALWAYS");
  await david.getByRole("button", { name: "Freigabe hinzufügen" }).click();
  await expect(david.getByText("Freigabe hinzugefügt.")).toBeVisible();
  await expect(david.getByText("Immer, außer blockiert").first()).toBeVisible();

  await david.getByRole("button", { name: "Pausieren" }).click();
  await expect(david.getByText(/Pausiert\. Es gibt keine bestehenden Zusagen/)).toBeVisible();
  await david.getByRole("button", { name: "Fortsetzen" }).click();
  await expect(david.getByText("Platz wieder aktiv.")).toBeVisible();
});

test("profile: deletion request and notification settings (R-09, N-03)", async ({ browser }) => {
  const emma = await loginAs(browser, "emma@example.org");
  await emma.goto("/profile");
  await emma.waitForLoadState("networkidle");
  await emma.getByLabel("Ende in 30 Minuten – Push").uncheck();
  await emma.getByRole("region", { name: "Benachrichtigungen" }).getByRole("button", { name: "Speichern" }).click();
  await expect(emma.getByRole("region", { name: "Benachrichtigungen" }).getByText("Gespeichert.")).toBeVisible();
  emma.once("dialog", (d) => d.accept());
  await emma.getByRole("button", { name: "Kontolöschung beantragen" }).click();
  await expect(emma.getByText(/Löschung beantragt am/)).toBeVisible();
  const admin = await loginAs(browser, "admin@example.org", { totp: ADMIN_TOTP });
  await admin.goto("/admin");
  await expect(admin.getByRole("heading", { name: "Löschanträge" })).toBeVisible();
});

test("Z-06: unpaid booking is cancelled automatically after 12 h", async ({ browser }) => {
  const clara = await loginAs(browser, "clara@example.org");
  const d = berlinDate(1); // 2 h booking -> tier 1 (max. 48 h ahead)
  await searchPeriod(clara, d, "18:00", d, "20:00");
  await openRequestFor(clara, "503");
  await clara.getByLabel(/Mietvertrag gelesen/).check();
  await clara.getByRole("button", { name: "Weiter zur Zahlung" }).click();
  await clara.getByLabel(/Testkarte 0002/).check();
  await clara.getByRole("button", { name: "Speichern & weiter" }).click();
  await clara.waitForURL(/\/bookings\//);
  await reloadUntil(clara, /Zahlung fehlgeschlagen/);
  const url = clara.url().split("?")[0];
  await clara.goto("/dev");
  await clara.waitForLoadState("networkidle");
  try {
    await clara.getByRole("button", { name: "+13 h" }).click();
    await expect(clara.getByText(/Uhr verstellt/)).toBeVisible();
    await clara.goto(url);
    await expect(clara.getByText(/^Storniert$/)).toBeVisible();
    await expect(clara.getByText(/System \(Zahlung nicht erfolgt\)/)).toBeVisible();
  } finally {
    await clara.goto("/dev");
    await clara.waitForLoadState("networkidle");
    await clara.getByRole("button", { name: "Echte Zeit" }).click();
    await expect(clara.getByText(/Uhr verstellt/)).toBeVisible();
  }
});
