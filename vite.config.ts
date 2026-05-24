import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [react(), cloudflare()],
  build: {
    outDir: process.env.VITE_OUT_DIR ?? "dist/client",
    emptyOutDir: false
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client/src"),
      "~": path.resolve(__dirname, "src")
    }
  }
});