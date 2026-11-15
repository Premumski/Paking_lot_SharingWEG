import { expect, test, type Page } from "@playwright/test";
import { ADMIN_TOTP, PASSWORD, berlinDate, loginAs, openRequestFor, reloadUntil, searchPeriod } from "./helpers";

/** Reads the newest test-mode e-mail matching `subject` from /dev and returns the first URL in it. */
async function linkFromMail(page: Page, subject: RegExp): Promise<string> {
  await page.goto("/dev");
  const item = page.getByRole("listitem").filter({ hasText: subject }).first();
  await item.locator("summary").click();
  const text = await item.locator("pre").innerText();
  const url = /https?:\/\/\S+/.exec(text)?.[0];
  expect(url).toBeTruthy();
  return url!;
}

test("P-09: a block over a confirmed booking requires explicit cancellation", async ({ browser }) => {
  const anna = await loginAs(browser, "anna@example.org");
  await anna.goto("/my-spots");
  await anna.getByRole("listitem").filter({ hasText: "502" }).getByRole("link", { name: "Verwalten" }).click();
  await anna.waitForURL(/\/my-spots\/.+/);
  await anna.waitForLoadState("networkidle");
  const blockForm = anna.locator("form").filter({ has: anna.getByRole("button", { name: "Blockieren" }) });
  const d = berlinDate(1);
  await blockForm.getByLabel("Von (Datum)").fill(d);
  await blockForm.getByLabel("Uhrzeit").first().selectOption("09:00");
  await blockForm.getByLabel("Bis (Datum)").fill(d);
  await blockForm.getByLabel("Uhrzeit").nth(1).selectOption("13:00");
  await blockForm.getByRole("button", { name: "Blockieren" }).click();
  await expect(anna.getByText(/kollidiert mit bestehenden Zusagen/)).toBeVisible();
  await anna.getByLabel("Begründung für die Mieter").fill("Wasserschaden, Platz gesperrt");
  await anna.getByRole("button", { name: "Buchungen stornieren und fortfahren" }).click();
  await expect(anna.getByText(/Blockierung gespeichert, 1 Buchung/)).toBeVisible();

  const emma = await loginAs(browser, "emma@example.org");
  await emma.goto("/bookings?role=tenant");
  await expect(emma.getByRole("row").filter({ hasText: "502" }).filter({ hasText: "Storniert" }).first()).toBeVisible();
});

test("A-01 / R-02: admin creates a resident, invitation link sets the password", async ({ browser }) => {
  const admin = await loginAs(browser, "admin@example.org", { totp: ADMIN_TOTP });
  await admin.goto("/admin/users");
  await admin.getByLabel("Name").first().fill("Tina Test");
  await admin.getByLabel("E-Mail").first().fill("tina@example.org");
  await admin.getByLabel("Wohnung").first().fill("W 4.01");
  await admin.getByRole("button", { name: "Anlegen & einladen" }).click();
  await expect(admin.getByText("Konto angelegt, Einladung verschickt.")).toBeVisible();
  const url = await linkFromMail(admin, /Einladung zum Stellplatz-Sharing/);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(new URL(url).pathname);
  await page.getByLabel("Neues Passwort").fill(PASSWORD);
  await page.getByLabel("Passwort wiederholen").fill(PASSWORD);
  await page.getByRole("button", { name: "Konto aktivieren" }).click();
  await page.waitForURL(/\/login\?done=1/);
  // Single use
  await page.goto(new URL(url).pathname);
  await expect(page.getByText(/ungültig, abgelaufen oder wurde schon verwendet/)).toBeVisible();
  const tina = await loginAs(browser, "tina@example.org");
  await expect(tina.getByRole("heading", { name: "Platz suchen" })).toBeVisible();
});

test("Z-07: SEPA direct debit processing, then bounce notifies everyone", async ({ browser }) => {
  const emma = await loginAs(browser, "emma@example.org");
  const d = berlinDate(2);
  await searchPeriod(emma, d, "08:00", d, "10:00");
  await openRequestFor(emma, "503"); // instant up to 1 day
  await emma.getByLabel(/Mietvertrag gelesen/).check();
  await emma.getByRole("button", { name: "Weiter zur Zahlung" }).click();
  await emma.getByLabel(/Test-SEPA-Lastschrift/).check();
  await emma.getByRole("button", { name: "Speichern & weiter" }).click();
  await emma.waitForURL(/\/bookings\//);
  await reloadUntil(emma, /Lastschrift in Bearbeitung/);
  await expect(emma.getByText(/^Zugesagt$/)).toBeVisible();
  await emma.goto("/dev");
  await emma.waitForLoadState("networkidle");
  await emma.getByRole("button", { name: "Platzen lassen" }).first().click();
  // wait until the bounce is processed (the debit disappears from the processing list)
  await expect(emma.getByRole("button", { name: "Platzen lassen" })).toHaveCount(0);
  await emma.goto("/bookings");
  await expect(emma.getByRole("row").filter({ hasText: "503" }).getByText("Zahlung fehlgeschlagen").first()).toBeVisible();
});

test("B-09: the running booking can be extended", async ({ browser }) => {
  const david = await loginAs(browser, "david@example.org");
  await david.goto("/bookings");
  await david.getByRole("row").filter({ hasText: "503" }).filter({ hasText: "Läuft" }).getByRole("link", { name: "Details" }).click();
  await david.waitForURL(/\/bookings\/.+/);
  await david.waitForLoadState("networkidle");
  await expect(david.getByRole("heading", { name: "Verlängern" })).toBeVisible();
  await expect(david.getByText(/Stufe 1/)).toBeVisible();
  await david.getByLabel(/Mietvertrag gelesen/).check();
  await david.getByRole("button", { name: "Weiter zur Zahlung" }).click(); // 1 h extension of a paid spot
  await david.waitForURL(/\/dev\/mock-pay/);
  await david.getByRole("button", { name: "Speichern & weiter" }).click();
  await david.waitForURL(/\/bookings\/.+created=1/);
  await reloadUntil(david, /^Zugesagt$/);
});

test("D-02: problem report with photo reaches the admin", async ({ browser }) => {
  const emma = await loginAs(browser, "emma@example.org");
  await emma.goto("/bookings?role=tenant");
  await emma.getByRole("row").filter({ hasText: "505" }).getByRole("link", { name: "Details" }).first().click();
  await emma.getByLabel("Beschreibung").fill("Fremdes Auto auf dem Platz.");
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082", "hex");
  await emma.getByLabel(/Fotos/).setInputFiles({ name: "beweis.png", mimeType: "image/png", buffer: png });
  await emma.getByRole("button", { name: "Meldung senden" }).click();
  await expect(emma.getByText("Meldung gesendet.")).toBeVisible();
  const admin = await loginAs(browser, "admin@example.org", { totp: ADMIN_TOTP });
  await admin.goto("/admin/problems");
  await expect(admin.getByText("Fremdes Auto auf dem Platz.")).toBeVisible();
  await admin.getByRole("button", { name: "Als erledigt markieren" }).first().click();
  await expect(admin.getByText(/erledigt am/).first()).toBeVisible();
});

test("Z-10 / S-08 / A-06: statements, receipts and exports", async ({ browser }) => {
  const ben = await loginAs(browser, "ben@example.org");
  const year = new Date().getFullYear();
  const csv = await ben.request.get(`/api/statement?year=${year}&format=csv`);
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain("503");
  const pdf = await ben.request.get(`/api/statement?year=${year}&format=pdf`);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  const exp = await ben.request.get("/api/export/me");
  expect((await exp.json()).profile.email).toBe("ben@example.org");
  const admin = await loginAs(browser, "admin@example.org", { totp: ADMIN_TOTP });
  const all = await admin.request.get("/api/admin/bookings?status=CONFIRMED");
  expect(all.status()).toBe(200);
  expect(await all.text()).toContain("CONFIRMED");
  expect((await ben.request.get("/api/admin/bookings")).status()).toBe(403);
});

test("T-10: unanswered requests expire (test clock)", async ({ browser }) => {
  // Emma requests 525 (manual confirmation, free); nobody answers.
  const emma = await loginAs(browser, "emma@example.org");
  const d = berlinDate(1);
  await searchPeriod(emma, d, "10:00", d, "12:00");
  await openRequestFor(emma, "525");
  await emma.getByLabel(/Mietvertrag gelesen/).check();
  await emma.getByRole("button", { name: "Anfrage senden" }).click();
  await emma.waitForURL(/\/bookings\//);
  await expect(emma.getByText(/^Angefragt$/)).toBeVisible();
  const url = emma.url().split("?")[0];
  await emma.goto("/dev");
  await emma.waitForLoadState("networkidle");
  try {
    await emma.getByRole("button", { name: "+72 h" }).click();
    await expect(emma.getByText(/Uhr verstellt/)).toBeVisible();
    await emma.goto(url);
    await expect(emma.getByText(/^Abgelaufen$/)).toBeVisible();
  } finally {
    await emma.goto("/dev");
    await emma.waitForLoadState("networkidle");
    await emma.getByRole("button", { name: "Echte Zeit" }).click();
    await expect(emma.getByText(/Uhr verstellt/)).toBeVisible();
  }
});
