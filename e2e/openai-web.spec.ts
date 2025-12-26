import { expect, test, type Page } from "@playwright/test";

async function resetWebAppState(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    indexedDB.deleteDatabase("tts-aloud-db");
  });
  await page.reload();
}

test("web UI can configure OpenAI and play a 2 sentence sample", async ({
  page,
}) => {
  const openAiApiKey = process.env.OPENAI_API_KEY;
  if (!openAiApiKey) {
    throw new Error("OPENAI_API_KEY is required for this test.");
  }

  const ttsRequests: string[] = [];
  const ttsResponseStatuses: number[] = [];
  page.on("request", (req) => {
    if (req.url().includes("/v1/audio/speech")) {
      const postData = req.postData();
      if (postData) {
        ttsRequests.push(postData);
      }
    }
  });
  page.on("response", (resp) => {
    if (resp.url().includes("/v1/audio/speech")) {
      ttsResponseStatuses.push(resp.status());
    }
  });

  await resetWebAppState(page);

  await page.getByRole("button", { name: "Settings" }).click();
  await expect(
    page.locator("dialog.web-tts-settings-modal[open]"),
  ).toBeVisible();

  await page.getByLabel("OpenAI API key").fill(openAiApiKey);
  await page.getByRole("button", { name: "Close Settings" }).click();
  await expect(page.locator("dialog.web-tts-settings-modal")).not.toBeVisible();

  const sampleText =
    "Playwright can drive real browsers reliably. This is the second sentence for chunking.";

  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+A");
  await page.keyboard.type(sampleText);
  await page.keyboard.press("Home");

  await page
    .getByRole("button", { name: "Play Selection (or from Cursor)" })
    .click();

  await expect(page.locator(".tts-toolbar-player")).toBeVisible();

  await expect
    .poll(() => ttsResponseStatuses.length, { timeout: 120_000 })
    .toBeGreaterThanOrEqual(2);
  expect(ttsResponseStatuses.slice(0, 2).every((s) => s === 200)).toBe(true);

  await expect
    .poll(() => ttsRequests.length, { timeout: 120_000 })
    .toBeGreaterThanOrEqual(2);

  await page.getByRole("button", { name: "Cancel playback" }).click();
  await expect(page.locator(".tts-toolbar-player")).not.toBeVisible();
});
