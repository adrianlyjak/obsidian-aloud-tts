import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import path from "path";

export default defineConfig({
  plugins: [nodePolyfills()],
  root: "./", // Serve from project root so we can access styles.css
  build: {
    outDir: "dist/web",
    rollupOptions: {
      input: "./src/web/index.html",
    },
  },
  resolve: {
    alias: {
      obsidian: path.resolve(__dirname, "__mocks__/obsidian.ts"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./test-setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    alias: {
      obsidian: path.resolve(__dirname, "__mocks__/obsidian.ts"),
    },
    coverage: {
      include: ["src/**/*"],
    },
  },
});
