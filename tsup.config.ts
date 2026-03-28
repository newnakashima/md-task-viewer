import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts", "src/server.ts"],
  format: ["esm"],
  target: "node24",
  platform: "node",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  splitting: false,
  dts: false,
  external: ["react", "react-dom"]
});
