import { generateKey } from "../readonly/crypto.js";

export function runGenerateKey(): void {
  const key = generateKey();
  process.stdout.write(`${key}\n`);
  process.stderr.write(
    [
      "",
      "Generated 256-bit AES-GCM key.",
      "Use it when building an encrypted read-only bundle:",
      "",
      `  export MD_TASK_VIEWER_READONLY_KEY="${key}"`,
      "  md-task-viewer build-readonly /path/to/tasks --out ./public",
      ""
    ].join("\n")
  );
}
