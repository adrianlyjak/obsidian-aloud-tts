import { expect, type Page } from "@playwright/test";

// ============================================================================
// Types
// ============================================================================

export interface TTSRequest {
  input: string;
  model: string;
  voice: string;
  response_format?: string;
  speed?: number;
  instructions?: string;
}

export interface TTSTracker {
  requests: TTSRequest[];
  responseStatuses: number[];
}

export type ModelProvider =
  | "openai"
  | "openaicompat"
  | "azure"
  | "elevenlabs"
  | "gemini"
  | "hume"
  | "minimax"
  | "inworld"
  | "polly";

export const MODEL_PROVIDER_LABELS: Record<ModelProvider, string> = {
  openai: "OpenAI",
  openaicompat: "OpenAI Compatible (Advanced)",
  azure: "Azure Speech Services",
  elevenlabs: "ElevenLabs",
  gemini: "Google Gemini",
  hume: "Hume",
  minimax: "MiniMax",
  inworld: "Inworld",
  polly: "AWS Polly",
};

// ============================================================================
// Environment
// ============================================================================

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for this test.`);
  }
  return value;
}

export function getOpenAIApiKey(): string {
  return requireEnv("OPENAI_API_KEY");
}

// ============================================================================
// TTS Request Tracking
// ============================================================================

/**
 * Sets up tracking for TTS API requests and responses.
 * Call this at the start of your test to monitor all /v1/audio/speech calls.
 */
export function trackTTSRequests(page: Page): TTSTracker {
  const tracker: TTSTracker = {
    requests: [],
    responseStatuses: [],
  };

  page.on("request", (req) => {
    if (req.url().includes("/v1/audio/speech")) {
      const postData = req.postData();
      if (postData) {
        try {
          tracker.requests.push(JSON.parse(postData) as TTSRequest);
        } catch {
          // ignore parse errors
        }
      }
    }
  });

  page.on("response", (resp) => {
    if (resp.url().includes("/v1/audio/speech")) {
      tracker.responseStatuses.push(resp.status());
    }
  });

  return tracker;
}

/**
 * Waits for at least N TTS requests to complete successfully.
 */
export async function waitForTTSRequests(
  tracker: TTSTracker,
  count: number,
  timeout = 30_000,
): Promise<void> {
  await expect
    .poll(() => tracker.responseStatuses.length, { timeout })
    .toBeGreaterThanOrEqual(count);

  for (let i = 0; i < count; i++) {
    expect(tracker.responseStatuses[i]).toBe(200);
  }
}

// ============================================================================
// Page State Management
// ============================================================================

/**
 * Resets the web app state by clearing localStorage and IndexedDB.
 */
export async function resetWebAppState(page: Page): Promise<void> {
  await page.goto("./");
  await page.evaluate(() => {
    localStorage.clear();
    indexedDB.deleteDatabase("tts-aloud-db");
  });
  await page.reload();
}

// ============================================================================
// Settings Modal Helpers
// ============================================================================

export class SettingsModal {
  constructor(private page: Page) {}

  /** Opens the settings modal */
  async open(): Promise<void> {
    await this.page.getByRole("button", { name: "Settings" }).click();
    await expect(
      this.page.locator("dialog.web-tts-settings-modal[open]"),
    ).toBeVisible();
  }

  /** Closes the settings modal */
  async close(): Promise<void> {
    await this.page.getByRole("button", { name: "Close Settings" }).click();
    await expect(
      this.page.locator("dialog.web-tts-settings-modal"),
    ).not.toBeVisible();
  }

  /** Switches to a different model provider */
  async selectProvider(provider: ModelProvider): Promise<void> {
    const dropdown = this.page.locator("select.dropdown").first();
    await expect(dropdown).toBeVisible();
    await dropdown.selectOption({ label: MODEL_PROVIDER_LABELS[provider] });
  }

  /** Gets a setting item by its label text */
  private getSettingItem(label: string | RegExp) {
    return this.page.locator(".setting-item").filter({ hasText: label });
  }

  /** Fills a text input setting */
  async fillTextSetting(label: string | RegExp, value: string): Promise<void> {
    const input = this.getSettingItem(label).locator("input");
    await input.fill(value);
  }

  /** Selects an option from a dropdown setting */
  async selectDropdownSetting(
    label: string | RegExp,
    value: string,
  ): Promise<void> {
    const select = this.getSettingItem(label).locator("select");
    await expect(select).toBeVisible();
    await select.selectOption(value);
  }

  /** Fills a text input by placeholder */
  async fillByPlaceholder(placeholder: string, value: string): Promise<void> {
    const input = this.page.locator(`input[placeholder="${placeholder}"]`);
    await input.fill(value);
  }
}

// ============================================================================
// Provider Configuration Helpers
// ============================================================================

export interface OpenAIConfig {
  apiKey: string;
}

export interface OpenAICompatConfig {
  apiKey: string;
  apiUrl?: string;
  model: string;
  voice: string;
  audioFormat?: "mp3" | "wav";
}

/**
 * Configures the OpenAI provider with the given settings.
 */
export async function configureOpenAI(
  settings: SettingsModal,
  config: OpenAIConfig,
): Promise<void> {
  await settings.selectProvider("openai");
  await settings.fillTextSetting("OpenAI API key", config.apiKey);
}

/**
 * Configures the OpenAI Compatible provider with the given settings.
 */
export async function configureOpenAICompat(
  settings: SettingsModal,
  config: OpenAICompatConfig,
): Promise<void> {
  await settings.selectProvider("openaicompat");

  // Wait for the provider settings to appear
  const page = (settings as any).page as Page;
  await expect(page.getByText("API URL")).toBeVisible();

  await settings.fillTextSetting("API key", config.apiKey);
  await settings.fillByPlaceholder(
    "https://api.openai.com",
    config.apiUrl ?? "https://api.openai.com",
  );
  await settings.fillTextSetting(/^Model/, config.model);
  await settings.fillTextSetting("Custom OpenAI Voice", config.voice);

  if (config.audioFormat) {
    await settings.selectDropdownSetting("Audio Format", config.audioFormat);
  }
}

// ============================================================================
// Editor Helpers
// ============================================================================

export class Editor {
  constructor(private page: Page) {}

  private get content() {
    return this.page.locator(".cm-content");
  }

  /** Clears the editor and types new text */
  async setText(text: string): Promise<void> {
    await this.content.click();
    await this.page.keyboard.press("ControlOrMeta+A");
    await this.page.keyboard.type(text);
  }

  /** Verifies the editor contains the given text */
  async expectToContain(text: string): Promise<void> {
    await expect(this.content).toContainText(text);
  }

  /** Verifies the editor does not contain the given text */
  async expectNotToContain(text: string): Promise<void> {
    await expect(this.content).not.toContainText(text);
  }

  /** Moves cursor to the start of the document */
  async moveCursorToStart(): Promise<void> {
    await this.page
      .locator(".cm-line")
      .first()
      .click({ position: { x: 0, y: 5 } });
  }
}

// ============================================================================
// Playback Helpers
// ============================================================================

export class Player {
  constructor(private page: Page) {}

  /** Starts playback from cursor or selection */
  async play(): Promise<void> {
    await this.page
      .getByRole("button", { name: "Play Selection (or from Cursor)" })
      .click();
  }

  /** Waits for the player toolbar to be visible */
  async expectToolbarVisible(): Promise<void> {
    await expect(this.page.locator(".tts-toolbar-player")).toBeVisible();
  }

  /** Gets the "playing now" highlighted text locator */
  get playingNow() {
    return this.page.locator(".tts-cm-playing-now");
  }

  /** Gets the "played before" highlighted text locator */
  get playedBefore() {
    return this.page.locator(".tts-cm-playing-before");
  }

  /** Gets the "playing after" highlighted text locator */
  get playingAfter() {
    return this.page.locator(".tts-cm-playing-after");
  }

  /** Waits for the currently playing text to contain the given string */
  async expectPlayingNowToContain(
    text: string,
    timeout = 10_000,
  ): Promise<void> {
    await expect(this.playingNow).toBeVisible({ timeout });
    await expect(this.playingNow).toContainText(text, { timeout });
  }

  /** Waits for playback to complete */
  async waitForPlaybackComplete(timeout = 60_000): Promise<void> {
    await expect(this.page.locator(".tts-audio-visualizer")).not.toBeVisible({
      timeout,
    });
    await expect(
      this.page.getByRole("button", { name: "Resume" }),
    ).toBeVisible();
  }

  /** Verifies all highlighting is removed */
  async expectNoHighlighting(): Promise<void> {
    await expect(this.playingNow).not.toBeVisible();
    await expect(this.playedBefore).not.toBeVisible();
    await expect(this.playingAfter).not.toBeVisible();
  }
}

// ============================================================================
// Test Context - Combines all helpers for easy access
// ============================================================================

export class TestContext {
  readonly settings: SettingsModal;
  readonly editor: Editor;
  readonly player: Player;
  readonly tracker: TTSTracker;

  constructor(readonly page: Page) {
    this.settings = new SettingsModal(page);
    this.editor = new Editor(page);
    this.player = new Player(page);
    this.tracker = trackTTSRequests(page);
  }

  /** Resets the app state and returns to a clean slate */
  async reset(): Promise<void> {
    await resetWebAppState(this.page);
  }

  /** Waits for at least N TTS requests to complete */
  async waitForTTSRequests(count: number, timeout?: number): Promise<void> {
    await waitForTTSRequests(this.tracker, count, timeout);
  }

  /** Gets all captured TTS requests */
  get requests(): TTSRequest[] {
    return this.tracker.requests;
  }
}
