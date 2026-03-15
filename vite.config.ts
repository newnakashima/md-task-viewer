import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist/client",
    emptyOutDir: false
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client/src"),
      "~": path.resolve(__dirname, "src")
    }
  }
});
