import { expect, test } from "@playwright/test";
import {
  TestContext,
  getOpenAIApiKey,
  configureOpenAI,
  configureOpenAICompat,
} from "./helpers";

test("web UI can configure OpenAI and play a 2 sentence sample to completion", async ({
  page,
}) => {
  const apiKey = getOpenAIApiKey();
  const ctx = new TestContext(page);

  await ctx.reset();

  // Configure OpenAI
  await ctx.settings.open();
  await configureOpenAI(ctx.settings, { apiKey });
  await ctx.settings.close();

  // Enter sample text with two distinct sentences
  const sentence1 = "Playwright can drive real browsers reliably.";
  const sentence2 = "This is the second sentence for chunking.";
  await ctx.editor.setText(`${sentence1} ${sentence2}`);
  await ctx.editor.expectToContain(sentence1);
  await ctx.editor.expectToContain(sentence2);
  await ctx.editor.expectNotToContain("Welcome");
  await ctx.editor.moveCursorToStart();

  // Start playback
  await ctx.player.play();
  await ctx.player.expectToolbarVisible();

  // Wait for first TTS request and verify highlighting
  await ctx.waitForTTSRequests(1);
  await ctx.player.expectPlayingNowToContain("Playwright");
  await expect(ctx.player.playingNow).toContainText("reliably");

  // Wait for second TTS request
  await ctx.waitForTTSRequests(2);

  // Verify the TTS requests contain the expected text chunks
  await expect
    .poll(() => ctx.requests.length, { timeout: 5_000 })
    .toBeGreaterThanOrEqual(2);
  expect(ctx.requests[0].input).toContain("Playwright");
  expect(ctx.requests[1].input).toContain("second sentence");

  // Wait for highlight to move to second sentence
  await expect(ctx.player.playingNow).toContainText("second sentence", {
    timeout: 30_000,
  });

  // First sentence should now be marked as "played before"
  await expect(ctx.player.playedBefore).toContainText("Playwright");

  // Wait for playback to complete
  await ctx.player.waitForPlaybackComplete();
  await ctx.player.expectNoHighlighting();
});

test("OpenAI Compatible provider with WAV format sends correct request and plays audio", async ({
  page,
}) => {
  const apiKey = getOpenAIApiKey();
  const ctx = new TestContext(page);

  await ctx.reset();

  // Configure OpenAI Compatible with WAV format
  await ctx.settings.open();
  await configureOpenAICompat(ctx.settings, {
    apiKey,
    model: "tts-1",
    voice: "alloy",
    audioFormat: "wav",
  });
  await ctx.settings.close();

  // Enter sample text
  const sampleText = "Testing WAV audio format with OpenAI Compatible provider.";
  await ctx.editor.setText(sampleText);
  await ctx.editor.expectToContain("Testing WAV");
  await ctx.editor.moveCursorToStart();

  // Start playback
  await ctx.player.play();
  await ctx.player.expectToolbarVisible();

  // Wait for TTS request to complete
  await ctx.waitForTTSRequests(1);

  // Verify the request was sent with WAV format
  await expect
    .poll(() => ctx.requests.length, { timeout: 5_000 })
    .toBeGreaterThanOrEqual(1);
  expect(ctx.requests[0].response_format).toBe("wav");
  expect(ctx.requests[0].model).toBe("tts-1");
  expect(ctx.requests[0].voice).toBe("alloy");

  // Verify text is highlighted as playing
  await ctx.player.expectPlayingNowToContain("Testing WAV");

  // Wait for playback to complete
  await ctx.player.waitForPlaybackComplete();
  await ctx.player.expectNoHighlighting();
});
