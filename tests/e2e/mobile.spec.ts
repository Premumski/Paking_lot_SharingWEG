import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

test("map and navigation work at 360 px (Q-03, K-05)", async ({ browser }) => {
  const page = await loginAs(browser, "emma@example.org");
  await page.setViewportSize({ width: 360, height: 760 });
  await page.goto("/");
  await expect(page.getByRole("tab", { name: "Hallenkarte" })).toBeVisible();
  await page.getByRole("tab", { name: "Hallenkarte" }).click();
  await expect(page.getByRole("img", { name: "Hallenplan der Tiefgarage: UG -1" })).toBeVisible();
  // K-01: the second level is one tap away and shows its own spots
  await page.getByRole("tab", { name: /UG -2/ }).click();
  await expect(page.getByRole("img", { name: "Hallenplan der Tiefgarage: UG -2" })).toBeVisible();
  await expect(page.locator('.garage-map [data-spot="525"]')).toBeVisible();
  await page.getByRole("button", { name: "Vergrößern" }).click();
  const hasHorizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(hasHorizontalScroll).toBe(false);
  await page.getByRole("button", { name: "Menü" }).click();
  await expect(page.getByRole("link", { name: "Meine Buchungen" })).toBeVisible();
});
