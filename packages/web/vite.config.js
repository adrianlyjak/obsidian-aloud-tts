import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import path from "path";

const workspaceRoot = path.resolve(__dirname, "../..");

export default defineConfig({
  plugins: [nodePolyfills()],
  resolve: {
    alias: {
      // obsidian is only available in the desktop plugin; use the no-op shim for the web build
      obsidian: path.resolve(workspaceRoot, "__mocks__/obsidian.ts"),
    },
  },
  root: "./src",
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    fs: {
      allow: [workspaceRoot],
    },
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: "./src/index.html",
    },
  },
});
