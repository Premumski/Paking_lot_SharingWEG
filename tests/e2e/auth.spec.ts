import { expect, test } from "@playwright/test";
import { ADMIN_TOTP, loginAs } from "./helpers";

test("no registration and protected pages (R-01, S-04)", async ({ page }) => {
  expect((await page.request.get("/register")).status()).toBe(404);
  expect((await page.request.get("/api/register")).status()).toBe(404);
  await page.goto("/bookings");
  await expect(page).toHaveURL(/\/login/);
  expect((await page.request.get("/api/export/me")).status()).toBe(401);
});

test("admin needs TOTP (R-04) and sees the admin area", async ({ browser }) => {
  const admin = await loginAs(browser, "admin@example.org", { totp: ADMIN_TOTP });
  await admin.goto("/admin/users");
  await expect(admin.getByRole("heading", { name: "Bewohner" })).toBeVisible();
  await expect(admin.getByRole("link", { name: "Anna Bauer" })).toBeVisible();
});

test("wrong password gives a generic error (R-05 style)", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/E-Mail/).fill("nobody@example.org");
  await page.getByLabel(/^Passwort$/).fill("wrong-password-123");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByText(/E-Mail oder Passwort ist falsch/)).toBeVisible();
});

test("residents cannot open the admin area or foreign bookings (S-04)", async ({ browser }) => {
  const emma = await loginAs(browser, "emma@example.org");
  await emma.goto("/admin");
  await expect(emma).toHaveURL(/\/$/);
  const res = await emma.request.get("/bookings/00000000-0000-4000-8000-000000000000");
  expect(res.status()).toBe(404);
});

test("language switch to English (L-01)", async ({ browser }) => {
  const anna = await loginAs(browser, "anna@example.org");
  await anna.goto("/profile");
  await anna.getByRole("combobox", { name: "Sprache" }).selectOption("en");
  await anna.getByRole("button", { name: "Speichern" }).first().click();
  await expect(anna.getByRole("status").filter({ hasText: /Gespeichert|Saved/ })).toBeVisible();
  await anna.goto("/");
  await expect(anna.getByRole("heading", { name: "Find a spot" })).toBeVisible();
  // restore German for the following tests
  await anna.goto("/profile");
  await anna.getByRole("combobox", { name: "Language" }).selectOption("de");
  await anna.getByRole("button", { name: "Save" }).first().click();
  await expect(anna.getByRole("status").filter({ hasText: /Gespeichert|Saved/ })).toBeVisible();
});
