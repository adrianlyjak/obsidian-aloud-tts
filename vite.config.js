import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import path from "path";

export default defineConfig({
  plugins: [nodePolyfills()],
  test: {
    environment: "jsdom",
    setupFiles: ["./test-setup.ts"],
    alias: {
      obsidian: path.resolve(__dirname, "__mocks__/obsidian.ts"),
    },
    coverage: {
      include: ["src/**/*"]
    },
  },
});
