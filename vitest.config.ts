import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  root: __dirname,
  test: {
    environment: "jsdom",
    setupFiles: ["./test-setup.ts"],
    include: ["packages/**/*.test.ts", "packages/**/*.test.tsx"],
    alias: {
      obsidian: path.resolve(__dirname, "__mocks__/obsidian.ts"),
      "open-tts/browser": path.resolve(
        __dirname,
        "packages/open-tts/src/browser/index.ts",
      ),
      "open-tts": path.resolve(__dirname, "packages/open-tts/src/index.ts"),
      "@open-tts/ui": path.resolve(__dirname, "packages/ui/src/index.ts"),
    },
    coverage: {
      include: ["packages/*/src/**/*"],
    },
  },
});
