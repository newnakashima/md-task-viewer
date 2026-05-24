import { generateKey } from "../readonly/crypto.js";

export function runGenerateKey(): void {
  const key = generateKey();
  process.stdout.write(`${key}\n`);
  process.stderr.write(
    [
      "",
      "Generated 256-bit AES-GCM key.",
      "Add to your shell or CI environment:",
      "",
      `  export MD_TASK_VIEWER_READONLY_KEY="${key}"`,
      "",
      "Then build with:",
      "",
      "  md-task-viewer build-readonly /path/to/repo --out ./dist-readonly",
      ""
    ].join("\n")
  );
}
