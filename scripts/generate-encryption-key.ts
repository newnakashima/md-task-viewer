import { generateKey } from "../src/readonly/crypto.js";

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
    "  npm run build:readonly -- /path/to/repo",
    ""
  ].join("\n")
);
