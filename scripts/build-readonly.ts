import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encryptSnapshot } from "../src/readonly/crypto.js";
import { collectSnapshot } from "../src/readonly/snapshot.js";

const projectRoot = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const rootDirArg = process.argv[2];
const rootDir = path.resolve(rootDirArg ?? process.cwd());
const key = process.env.MD_TASK_VIEWER_READONLY_KEY;
const encrypted = Boolean(key);

const snapshot = await collectSnapshot(rootDir);
const snapshotJson = JSON.stringify(snapshot);

const outDir = path.join(projectRoot, "dist", "client", "data");
await fs.mkdir(outDir, { recursive: true });
const outFile = path.join(outDir, "snapshot.json");

if (key) {
  const envelope = await encryptSnapshot(snapshotJson, key);
  await fs.writeFile(
    outFile,
    JSON.stringify({
      version: 1,
      generatedAt: snapshot.generatedAt,
      ...envelope
    })
  );
  process.stderr.write(`[md-task-viewer] Wrote encrypted snapshot to ${path.relative(projectRoot, outFile)}\n`);
} else {
  await fs.writeFile(
    outFile,
    JSON.stringify({
      version: 1,
      generatedAt: snapshot.generatedAt,
      encrypted: false,
      tasks: snapshot.tasks,
      errors: snapshot.errors
    })
  );
  process.stderr.write(
    "[md-task-viewer] WARNING: building without encryption key. Snapshot will be publicly readable.\n" +
      "  Set MD_TASK_VIEWER_READONLY_KEY (see `npm run generate:key`) to encrypt.\n"
  );
}

process.stderr.write(`[md-task-viewer] Running vite build (readonly=${encrypted ? "encrypted" : "plain"})...\n`);
const result = spawnSync("npx", ["vite", "build"], {
  cwd: projectRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    VITE_READONLY: "true"
  }
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
