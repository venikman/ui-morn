import { test, expect } from "@playwright/test";

test("Scenario B supports keyboard completion", async ({ page }) => {
  await page.goto("/");

  const runButtons = page.getByRole("button", { name: "Run" });
  await runButtons.nth(1).focus();
  await page.keyboard.press("Enter");

  const nameInput = page.getByPlaceholder("Ada Lovelace");
  await expect(nameInput).toBeVisible();
  await nameInput.fill("Alex Demo");

  const emailInput = page.getByPlaceholder("ada@example.com");
  await emailInput.fill("alex@example.com");

  const projectInput = page.getByPlaceholder("Bakeoff demo");
  await projectInput.fill("Protocol demo");

  await page.getByRole("button", { name: "High" }).click();
  await page.getByRole("button", { name: "Confirm" }).focus();
  await page.keyboard.press("Enter");
});
