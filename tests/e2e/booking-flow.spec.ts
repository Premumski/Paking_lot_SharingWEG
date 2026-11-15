import { expect, test } from "@playwright/test";
import { berlinDate, loginAs, openRequestFor, reloadUntil, searchPeriod } from "./helpers";

/**
 * Q-04: request -> confirmation -> payment -> cancellation (with refund).
 * 503 (owner Ben, 2 €/h, 15 €/day, instant up to 1 day). A 2-day request needs manual confirmation.
 */
test("paid request: confirm, charge, cancel and refund", async ({ browser }) => {
  const from = berlinDate(5);
  const to = berlinDate(7);

  // Tenant Emma sends the request
  const emma = await loginAs(browser, "emma@example.org");
  await searchPeriod(emma, from, "10:00", to, "10:00");
  await openRequestFor(emma, "503");
  await expect(emma.getByText("Stufe 2")).toBeVisible();
  await expect(emma.getByLabel("Zusammenfassung").getByText("30,00 €")).toBeVisible();
  await expect(emma.getByText(/wartet auf die Bestätigung/)).toBeVisible();
  await expect(emma.getByText(/Stornieren ist bis zum Beginn jederzeit kostenlos/)).toBeVisible();
  const submit = emma.getByRole("button", { name: "Weiter zur Zahlung" });
  await expect(submit).toBeDisabled(); // V-03: contract checkbox not pre-selected
  await emma.getByLabel(/Mietvertrag gelesen/).check();
  await submit.click();

  // Mock hosted payment page (like Stripe Checkout in setup mode)
  await emma.waitForURL(/\/dev\/mock-pay/);
  await emma.getByLabel(/Testkarte 4242/).check();
  await emma.getByRole("button", { name: "Speichern & weiter" }).click();
  await emma.waitForURL(/\/bookings\//);
  await reloadUntil(emma, /^Angefragt$/);
  const bookingUrl = emma.url().split("?")[0];

  // Owner Ben (English UI) confirms
  const ben = await loginAs(browser, "ben@example.org");
  await ben.goto(bookingUrl);
  await expect(ben.getByText(/you receive approx\./)).toBeVisible(); // Z-05
  await ben.getByRole("button", { name: "Confirm" }).click();
  await reloadUntil(ben, /^Paid$/);
  await expect(ben.getByRole("link", { name: "Rental contract (PDF)" })).toBeVisible();

  // Contract PDF is downloadable
  const pdf = await ben.request.get(bookingUrl.replace("/bookings/", "/api/contracts/"));
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");

  // Tenant sees access notes after confirmation (D-01) and cancels for free (B-06)
  await emma.goto(bookingUrl);
  await expect(emma.getByText("Wallbox-Karte hängt am Pfeiler.")).toBeVisible();
  await emma.getByRole("button", { name: "Stornieren" }).click();
  await expect(emma.getByText(/30,00\s€ werden vollständig erstattet/)).toBeVisible();
  await emma.getByRole("button", { name: "Verbindlich stornieren" }).click();
  await reloadUntil(emma, /^Erstattet$/);
  await expect(emma.getByText(/^Storniert$/).first()).toBeVisible();
});

test("free spot with instant confirmation (B-02, Z-11)", async ({ browser }) => {
  const david = await loginAs(browser, "david@example.org");
  const d = berlinDate(1);
  await searchPeriod(david, d, "09:00", d, "13:00");
  await openRequestFor(david, "505");
  await expect(david.getByText(/wird sofort bestätigt/)).toBeVisible();
  await expect(david.getByText(/Kostenlos – kein Zahlungsschritt/)).toBeVisible();
  await david.getByLabel(/Mietvertrag gelesen/).check();
  await david.getByRole("button", { name: "Jetzt verbindlich buchen" }).click();
  await david.waitForURL(/\/bookings\//);
  await expect(david.getByText(/sofort bestätigt/)).toBeVisible();
  await expect(david.getByText(/^Zugesagt$/)).toBeVisible();

  // T-18: the same period is no longer available to others
  const emma = await loginAs(browser, "emma@example.org");
  await searchPeriod(emma, d, "10:00", d, "12:00");
  const row = emma.getByRole("row").filter({ hasText: "505" });
  await expect(row.getByText("belegt / nicht freigegeben")).toBeVisible();
});

test("declined card: payment problem and retry within 12 h (Z-06)", async ({ browser }) => {
  const clara = await loginAs(browser, "clara@example.org");
  const d = berlinDate(1);
  await searchPeriod(clara, d, "14:00", d, "16:00");
  await openRequestFor(clara, "502"); // instant up to 4 h, 1.50 €/h
  await expect(clara.getByText("3,00 €").first()).toBeVisible();
  await clara.getByLabel(/Mietvertrag gelesen/).check();
  await clara.getByRole("button", { name: "Weiter zur Zahlung" }).click();
  await clara.waitForURL(/\/dev\/mock-pay/);
  await clara.getByLabel(/Testkarte 0002/).check();
  await clara.getByRole("button", { name: "Speichern & weiter" }).click();
  await clara.waitForURL(/\/bookings\//);
  await reloadUntil(clara, /Zahlung fehlgeschlagen/);
  await clara.getByRole("button", { name: "Jetzt bezahlen" }).click();
  await clara.waitForURL(/\/dev\/mock-pay/);
  await clara.getByLabel(/Testkarte 4242/).check();
  await clara.getByRole("button", { name: "Jetzt bezahlen" }).click();
  await clara.waitForURL(/\/bookings\//);
  await reloadUntil(clara, /^Bezahlt$/);
});
