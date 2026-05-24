import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encryptSnapshot } from "../readonly/crypto.js";
import { collectSnapshot } from "../readonly/snapshot.js";

export interface BuildReadonlyOptions {
  rootDir: string;
  outDir: string;
  key?: string;
}

function resolveBundledClientDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "client-readonly");
}

export async function runBuildReadonly(options: BuildReadonlyOptions): Promise<void> {
  const rootDir = path.resolve(options.rootDir);
  const outDir = path.resolve(options.outDir);
  const bundledClientDir = resolveBundledClientDir();

  try {
    const stats = await fs.stat(bundledClientDir);
    if (!stats.isDirectory()) {
      throw new Error("not a directory");
    }
  } catch {
    throw new Error(
      `Could not find the bundled read-only client at ${bundledClientDir}. ` +
        `Reinstall md-task-viewer or rebuild with \`npm run build\`.`
    );
  }

  await fs.rm(outDir, { recursive: true, force: true });
  await fs.cp(bundledClientDir, outDir, { recursive: true });

  const snapshot = await collectSnapshot(rootDir);
  const snapshotJson = JSON.stringify(snapshot);

  const dataDir = path.join(outDir, "data");
  await fs.mkdir(dataDir, { recursive: true });
  const snapshotFile = path.join(dataDir, "snapshot.json");

  if (options.key) {
    const envelope = await encryptSnapshot(snapshotJson, options.key);
    await fs.writeFile(
      snapshotFile,
      JSON.stringify({
        version: 1,
        generatedAt: snapshot.generatedAt,
        ...envelope
      })
    );
    process.stderr.write(`[md-task-viewer] Wrote encrypted snapshot to ${snapshotFile}\n`);
  } else {
    await fs.writeFile(
      snapshotFile,
      JSON.stringify({
        version: 1,
        generatedAt: snapshot.generatedAt,
        encrypted: false,
        tasks: snapshot.tasks,
        errors: snapshot.errors
      })
    );
    process.stderr.write(
      `[md-task-viewer] Wrote plain snapshot to ${snapshotFile}\n` +
        "  WARNING: snapshot is unencrypted and will be publicly readable wherever you host it.\n" +
        "  Set MD_TASK_VIEWER_READONLY_KEY (see `md-task-viewer generate-key`) to encrypt.\n"
    );
  }

  process.stderr.write(`[md-task-viewer] Read-only bundle ready at ${outDir}\n`);
}
