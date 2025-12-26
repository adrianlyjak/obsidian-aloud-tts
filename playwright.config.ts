import { defineConfig, devices } from "@playwright/test";

const openAiApiKey = process.env.OPENAI_API_KEY;
if (!openAiApiKey) {
  throw new Error(
    "OPENAI_API_KEY is required for Playwright e2e tests. Set it in your environment before running `pnpm e2e`.",
  );
}

export default defineConfig({
  testDir: "./e2e",
  timeout: 2 * 60 * 1000,
  expect: { timeout: 30 * 1000 },
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "pnpm web:dev -- --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
