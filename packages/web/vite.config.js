import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import path from "path";

const workspaceRoot = path.resolve(__dirname, "../..");

export default defineConfig({
  plugins: [nodePolyfills()],
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
