import { defineConfig, devices } from "@playwright/test";

const openAiApiKey = process.env.OPENAI_API_KEY;
if (!openAiApiKey) {
  throw new Error(
    "OPENAI_API_KEY is required. Set it before running memory tests:\n" +
      "  OPENAI_API_KEY=sk-... npx playwright test --config playwright.memory.config.ts",
  );
}

/**
 * Playwright config for the long-running memory leak test.
 * Separate from the main e2e config — runs only *.memory.spec.ts files.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... npx playwright test --config playwright.memory.config.ts
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "*.memory.spec.ts",
  outputDir: "./test-results-memory",
  timeout: 10 * 60 * 1000, // 10 minutes — long playback
  expect: { timeout: 60 * 1000 },
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:5173/src/web/",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "pnpm web:dev",
    url: "http://127.0.0.1:5173/src/web/",
    reuseExistingServer: true,
    timeout: 120 * 1000,
    stdout: "pipe",
    stderr: "pipe",
  },
  projects: [
    {
      name: "chromium-memory",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: [
            // Exposes performance.memory with byte-level precision
            "--enable-precise-memory-info",
            // Allows CDP HeapProfiler.collectGarbage for deterministic GC
            "--js-flags=--expose-gc",
          ],
        },
      },
    },
  ],
});
