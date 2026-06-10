import { expect, test } from "@playwright/test";

test("street-food world cup can complete a play session", async ({ page }) => {
  await page.goto("/worldcup/street-food/play");

  await expect(page.getByRole("heading", { name: "길거리 음식 월드컵" })).toBeVisible();

  for (let attempt = 0; attempt < 24; attempt += 1) {
    if (page.url().includes("/result/") || (await page.getByText("나의 우승자").isVisible())) {
      break;
    }

    const choices = page.getByRole("button", { name: /후보/ });
    await expect(choices.first()).toBeEnabled();
    await choices.first().click();
    await page.waitForTimeout(100);
  }

  await expect(page).toHaveURL(/\/worldcup\/street-food\/result\/session_/);
  await expect(page.getByText("나의 우승자")).toBeVisible();
});
