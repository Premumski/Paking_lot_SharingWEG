import { expect, type Browser, type Page } from "@playwright/test";
import { authenticator } from "otplib";

export const PASSWORD = "Stellplatz-Test-2026!";
export const ADMIN_TOTP = "JBSWY3DPEHPK3PXPJBSWY3DP";

export async function loginAs(browser: Browser, email: string, opts: { totp?: string } = {}): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel(/E-Mail/).fill(email);
  await page.getByLabel(/^Passwort$|^Password$/).fill(PASSWORD);
  await page.getByRole("button", { name: /^Anmelden$|^Log in$/ }).click();
  if (opts.totp) {
    await page.waitForURL(/\/login\/2fa/);
    await page.getByLabel(/Code/).fill(authenticator.generate(opts.totp));
    await page.getByRole("button", { name: /Bestätigen|Verify/ }).click();
  }
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  return page;
}

/** Berlin-local date "YYYY-MM-DD" n days from today. */
export function berlinDate(daysAhead: number): string {
  const d = new Date(Date.now() + daysAhead * 86_400_000);
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(d);
}

export async function searchPeriod(page: Page, fromDate: string, fromTime: string, toDate: string, toTime: string) {
  const q = new URLSearchParams({ fromDate, fromTime, toDate, toTime });
  await page.goto(`/?${q}`);
  await page.getByRole("tab", { name: /Liste|List/ }).click();
}

export async function openRequestFor(page: Page, planNumber: string) {
  const row = page.getByRole("row").filter({ hasText: planNumber }).or(page.getByRole("listitem").filter({ hasText: planNumber }));
  await row.getByRole("link", { name: /Anfragen|Request/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(planNumber);
  await page.waitForLoadState("networkidle");
}

export async function reloadUntil(page: Page, text: RegExp, tries = 10) {
  for (let i = 0; i < tries; i++) {
    if (await page.getByText(text).first().isVisible().catch(() => false)) return;
    await page.waitForTimeout(700);
    await page.reload();
  }
  await expect(page.getByText(text).first()).toBeVisible();
}
