import { defineConfig, devices } from "@playwright/test";

const openAiApiKey = process.env.OPENAI_API_KEY;
if (!openAiApiKey) {
  throw new Error(
    "OPENAI_API_KEY is required for Playwright e2e tests. Set it in your environment before running `pnpm e2e`.",
  );
}

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  timeout: 2 * 60 * 1000,
  expect: { timeout: 30 * 1000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { outputFolder: "playwright-report" }]],
  use: {
    baseURL: "http://127.0.0.1:5173/src/web/",
    trace: "on",
    screenshot: "on",
    video: "on",
  },
  webServer: {
    command: "pnpm web:dev",
    url: "http://127.0.0.1:5173/src/web/",
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    stdout: "pipe",
    stderr: "pipe",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
