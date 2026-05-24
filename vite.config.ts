import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

import { cloudflare } from "@cloudflare/vite-plugin";

function resolveOutDir(): string {
  if (process.env.VITE_READONLY === "true") {
    return process.env.VITE_READONLY_ENCRYPTED === "true"
      ? "dist/client-readonly"
      : "dist/client-readonly-plain";
  }
  return "dist/client";
}

export default defineConfig({
  plugins: [react(), cloudflare()],
  build: {
    outDir: resolveOutDir(),
    emptyOutDir: false
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client/src"),
      "~": path.resolve(__dirname, "src")
    }
  }
});