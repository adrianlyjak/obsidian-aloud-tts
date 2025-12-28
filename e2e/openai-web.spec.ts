import { expect, test, type Page } from "@playwright/test";

interface TTSRequest {
  input: string;
  model: string;
  voice: string;
  response_format?: string;
}

async function resetWebAppState(page: Page): Promise<void> {
  await page.goto("./");
  await page.evaluate(() => {
    localStorage.clear();
    indexedDB.deleteDatabase("tts-aloud-db");
  });
  await page.reload();
}

test("web UI can configure OpenAI and play a 2 sentence sample to completion", async ({
  page,
}) => {
  const openAiApiKey = process.env.OPENAI_API_KEY;
  if (!openAiApiKey) {
    throw new Error("OPENAI_API_KEY is required for this test.");
  }

  const ttsRequests: TTSRequest[] = [];
  const ttsResponseStatuses: number[] = [];

  page.on("request", (req) => {
    if (req.url().includes("/v1/audio/speech")) {
      const postData = req.postData();
      if (postData) {
        try {
          ttsRequests.push(JSON.parse(postData) as TTSRequest);
        } catch {
          // ignore parse errors
        }
      }
    }
  });
  page.on("response", (resp) => {
    if (resp.url().includes("/v1/audio/speech")) {
      ttsResponseStatuses.push(resp.status());
    }
  });

  await resetWebAppState(page);

  // Configure OpenAI API key
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(
    page.locator("dialog.web-tts-settings-modal[open]"),
  ).toBeVisible();

  await page.getByLabel("OpenAI API key").fill(openAiApiKey);
  await page.getByRole("button", { name: "Close Settings" }).click();
  await expect(page.locator("dialog.web-tts-settings-modal")).not.toBeVisible();

  // Enter sample text with two distinct sentences
  const sentence1 = "Playwright can drive real browsers reliably.";
  const sentence2 = "This is the second sentence for chunking.";
  const sampleText = `${sentence1} ${sentence2}`;

  // Clear existing text and type new content
  const editor = page.locator(".cm-content");
  await editor.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type(sampleText); // Typing replaces selection
  // Verify text was entered correctly (and old text is gone)
  await expect(editor).toContainText(sentence1);
  await expect(editor).toContainText(sentence2);
  await expect(editor).not.toContainText("Welcome");
  // Move cursor to start of document - click at the very start of the first line
  await page.locator(".cm-line").first().click({ position: { x: 0, y: 5 } });

  // Start playback
  await page
    .getByRole("button", { name: "Play Selection (or from Cursor)" })
    .click();

  // Verify player UI appears
  await expect(page.locator(".tts-toolbar-player")).toBeVisible();

  // Wait for first TTS request to complete
  await expect
    .poll(() => ttsResponseStatuses.length, { timeout: 30_000 })
    .toBeGreaterThanOrEqual(1);
  expect(ttsResponseStatuses[0]).toBe(200);

  // Verify first sentence is highlighted as "playing now"
  const playingNow = page.locator(".tts-cm-playing-now");
  await expect(playingNow).toBeVisible({ timeout: 10_000 });
  await expect(playingNow).toContainText("Playwright");
  await expect(playingNow).toContainText("reliably");

  // Wait for second TTS request
  await expect
    .poll(() => ttsResponseStatuses.length, { timeout: 30_000 })
    .toBeGreaterThanOrEqual(2);
  expect(ttsResponseStatuses[1]).toBe(200);

  // Verify the TTS requests contain the expected text chunks
  await expect
    .poll(() => ttsRequests.length, { timeout: 5_000 })
    .toBeGreaterThanOrEqual(2);

  const requestTexts = ttsRequests.map((r) => r.input);
  expect(requestTexts[0]).toContain("Playwright");
  expect(requestTexts[1]).toContain("second sentence");

  // Wait for highlight to move to second sentence
  await expect(playingNow).toContainText("second sentence", { timeout: 30_000 });

  // At this point, first sentence should be marked as "played before"
  const playedBefore = page.locator(".tts-cm-playing-before");
  await expect(playedBefore).toContainText("Playwright");

  // Wait for playback to complete:
  // - Audio visualizer disappears
  // - Pause button becomes Resume button
  await expect(page.locator(".tts-audio-visualizer")).not.toBeVisible({
    timeout: 60_000,
  });
  await expect(
    page.getByRole("button", { name: "Resume" }),
  ).toBeVisible();

  // Verify all highlighting is removed after completion
  await expect(page.locator(".tts-cm-playing-now")).not.toBeVisible();
  await expect(page.locator(".tts-cm-playing-before")).not.toBeVisible();
  await expect(page.locator(".tts-cm-playing-after")).not.toBeVisible();
});

test("OpenAI Compatible provider with WAV format sends correct request and plays audio", async ({
  page,
}) => {
  const openAiApiKey = process.env.OPENAI_API_KEY;
  if (!openAiApiKey) {
    throw new Error("OPENAI_API_KEY is required for this test.");
  }

  const ttsRequests: TTSRequest[] = [];
  const ttsResponseStatuses: number[] = [];

  page.on("request", (req) => {
    if (req.url().includes("/v1/audio/speech")) {
      const postData = req.postData();
      if (postData) {
        try {
          ttsRequests.push(JSON.parse(postData) as TTSRequest);
        } catch {
          // ignore parse errors
        }
      }
    }
  });
  page.on("response", (resp) => {
    if (resp.url().includes("/v1/audio/speech")) {
      ttsResponseStatuses.push(resp.status());
    }
  });

  await resetWebAppState(page);

  // Open settings modal
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(
    page.locator("dialog.web-tts-settings-modal[open]"),
  ).toBeVisible();

  // Switch to OpenAI Compatible provider - the dropdown is next to the "Model Provider" h1
  const modelProviderDropdown = page
    .locator("select.dropdown")
    .first();
  await expect(modelProviderDropdown).toBeVisible();
  await modelProviderDropdown.selectOption({ label: "OpenAI Compatible (Advanced)" });

  // Wait for the OpenAI Compatible settings to appear
  await expect(page.getByText("API URL")).toBeVisible();

  // Configure OpenAI Compatible settings to point to the actual OpenAI API
  // The API key field label is just "API key" for openaicompat
  const apiKeyInput = page
    .locator(".setting-item")
    .filter({ hasText: "API key" })
    .locator("input");
  await apiKeyInput.fill(openAiApiKey);

  // Fill in API URL
  const apiUrlInput = page.locator('input[placeholder="https://api.openai.com"]');
  await apiUrlInput.fill("https://api.openai.com");

  // Fill in model
  const modelInput = page
    .locator(".setting-item")
    .filter({ hasText: /^Model/ })
    .locator("input");
  await modelInput.fill("tts-1");

  // Fill in voice
  const voiceInput = page
    .locator(".setting-item")
    .filter({ hasText: "Custom OpenAI Voice" })
    .locator("input");
  await voiceInput.fill("alloy");

  // Select WAV audio format
  const audioFormatSelect = page
    .locator(".setting-item")
    .filter({ hasText: "Audio Format" })
    .locator("select");
  await expect(audioFormatSelect).toBeVisible();
  await audioFormatSelect.selectOption("wav");

  // Close settings
  await page.getByRole("button", { name: "Close Settings" }).click();
  await expect(page.locator("dialog.web-tts-settings-modal")).not.toBeVisible();

  // Enter sample text
  const sampleText = "Testing WAV audio format with OpenAI Compatible provider.";

  const editor = page.locator(".cm-content");
  await editor.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type(sampleText);
  await expect(editor).toContainText("Testing WAV");

  // Move cursor to start
  await page.locator(".cm-line").first().click({ position: { x: 0, y: 5 } });

  // Start playback
  await page
    .getByRole("button", { name: "Play Selection (or from Cursor)" })
    .click();

  // Verify player UI appears
  await expect(page.locator(".tts-toolbar-player")).toBeVisible();

  // Wait for TTS request to complete
  await expect
    .poll(() => ttsResponseStatuses.length, { timeout: 30_000 })
    .toBeGreaterThanOrEqual(1);
  expect(ttsResponseStatuses[0]).toBe(200);

  // Verify the request was sent with WAV format
  await expect
    .poll(() => ttsRequests.length, { timeout: 5_000 })
    .toBeGreaterThanOrEqual(1);
  expect(ttsRequests[0].response_format).toBe("wav");
  expect(ttsRequests[0].model).toBe("tts-1");
  expect(ttsRequests[0].voice).toBe("alloy");

  // Verify text is highlighted as playing
  const playingNow = page.locator(".tts-cm-playing-now");
  await expect(playingNow).toBeVisible({ timeout: 10_000 });
  await expect(playingNow).toContainText("Testing WAV");

  // Wait for playback to complete
  await expect(page.locator(".tts-audio-visualizer")).not.toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();

  // Verify highlighting is removed after completion
  await expect(page.locator(".tts-cm-playing-now")).not.toBeVisible();
});
