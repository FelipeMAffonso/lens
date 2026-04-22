import { test, expect } from "@playwright/test";

test.describe("lens-b1h.pages.dev smoke", () => {
  test("loads the dashboard with the hero heading", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Lens/);
    await expect(
      page.getByRole("heading", { name: /Your independent AI shopping agent/i }),
    ).toBeVisible();
  });

  test("renders the three input mode tabs", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("tab", { name: /I want to buy something/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /I'm looking at this product/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Audit an AI's answer/i })).toBeVisible();
  });

  test("pack-stats ticker eventually populates", async ({ page }) => {
    await page.goto("/");
    const ticker = page.locator("#pack-stats");
    // First render is "loading…"; the first network call replaces it within a few seconds.
    await expect(ticker).toContainText(/packs|offline/i, { timeout: 20_000 });
  });

  test("privacy notice route renders", async ({ page }) => {
    await page.goto("/privacy.html");
    await expect(page.getByRole("heading", { name: /Privacy notice/i })).toBeVisible();
    await expect(page.getByText(/data Lens processes/i)).toBeVisible();
  });

  test("query mode switch reveals the query textarea", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: /I want to buy something/i }).click();
    await expect(page.locator("#query-prompt")).toBeVisible();
  });

  test("url mode switch reveals the URL input", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: /I'm looking at this product/i }).click();
    await expect(page.locator("#url-input")).toBeVisible();
  });

  test("text mode switch reveals the source select", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: /Audit an AI's answer/i }).click();
    await expect(page.locator("#source")).toBeVisible();
    await expect(page.locator("#ai-output")).toBeVisible();
  });
});
