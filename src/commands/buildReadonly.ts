import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encryptSnapshot } from "../readonly/crypto.js";
import { collectSnapshot } from "../readonly/snapshot.js";

export interface BuildReadonlyOptions {
  rootDir: string;
  outputDir: string;
  encryptionKey?: string | null;
  packageRoot?: string;
}

const ENCRYPTED_TEMPLATE = "client-readonly";
const PLAIN_TEMPLATE = "client-readonly-plain";

function defaultPackageRoot(): string {
  // The bundled CLI lives at <pkg>/dist/cli.js, so the package root is one
  // directory above this file.
  const fileDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(fileDir, "..");
}

async function ensureTemplate(templateDir: string, variant: string): Promise<void> {
  try {
    const stat = await fs.stat(templateDir);
    if (!stat.isDirectory()) {
      throw new Error(`Template path is not a directory: ${templateDir}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `Pre-built read-only client (${variant}) is missing at ${templateDir}. ` +
          "Reinstall md-task-viewer or rebuild the package."
      );
    }
    throw error;
  }
}

export async function runBuildReadonly(options: BuildReadonlyOptions): Promise<void> {
  const rootDir = path.resolve(options.rootDir);
  const outputDir = path.resolve(options.outputDir);
  const key = options.encryptionKey?.trim() || undefined;
  const encrypted = Boolean(key);
  const packageRoot = options.packageRoot ?? defaultPackageRoot();
  const templateDir = path.join(
    packageRoot,
    "dist",
    encrypted ? ENCRYPTED_TEMPLATE : PLAIN_TEMPLATE
  );

  await ensureTemplate(templateDir, encrypted ? "encrypted" : "plain");

  process.stderr.write(`[md-task-viewer] Collecting snapshot from ${rootDir}\n`);
  const snapshot = await collectSnapshot(rootDir);

  await fs.mkdir(outputDir, { recursive: true });
  await fs.cp(templateDir, outputDir, { recursive: true });

  const dataDir = path.join(outputDir, "data");
  await fs.mkdir(dataDir, { recursive: true });
  const snapshotPath = path.join(dataDir, "snapshot.json");

  if (key) {
    const envelope = await encryptSnapshot(JSON.stringify(snapshot), key);
    await fs.writeFile(
      snapshotPath,
      JSON.stringify({
        version: 1,
        generatedAt: snapshot.generatedAt,
        ...envelope
      })
    );
    process.stderr.write(`[md-task-viewer] Wrote encrypted snapshot to ${snapshotPath}\n`);
  } else {
    await fs.writeFile(
      snapshotPath,
      JSON.stringify({
        version: 1,
        generatedAt: snapshot.generatedAt,
        encrypted: false,
        tasks: snapshot.tasks,
        errors: snapshot.errors
      })
    );
    process.stderr.write(
      `[md-task-viewer] Wrote plain snapshot to ${snapshotPath}\n` +
        "[md-task-viewer] WARNING: built without encryption key. Snapshot is publicly readable.\n" +
        "  Set MD_TASK_VIEWER_READONLY_KEY (see `md-task-viewer generate-key`) to encrypt.\n"
    );
  }

  process.stderr.write(
    `[md-task-viewer] Read-only site ready at ${outputDir} ` +
      `(${encrypted ? "encrypted" : "plain"}, ${snapshot.tasks.length} tasks, ${snapshot.errors.length} errors)\n`
  );
}

export interface ParsedBuildReadonlyArgs {
  rootDir: string;
  outputDir: string;
  encryptionKey?: string;
}

export function parseBuildReadonlyArgs(argv: string[]): ParsedBuildReadonlyArgs {
  let rootDir = process.cwd();
  let outputDir: string | null = null;
  let encryptionKey: string | undefined = process.env.MD_TASK_VIEWER_READONLY_KEY?.trim() || undefined;
  let positionalSeen = false;

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === "--out" || current === "--output" || current === "-o") {
      const next = argv[index + 1];
      if (!next) {
        throw new Error(`Missing value for ${current}`);
      }
      outputDir = next;
      index += 1;
      continue;
    }
    if (current === "--key" || current === "-k") {
      const next = argv[index + 1];
      if (!next) {
        throw new Error(`Missing value for ${current}`);
      }
      encryptionKey = next;
      index += 1;
      continue;
    }
    if (current.startsWith("--out=")) {
      outputDir = current.slice("--out=".length);
      continue;
    }
    if (current.startsWith("--output=")) {
      outputDir = current.slice("--output=".length);
      continue;
    }
    if (current.startsWith("--key=")) {
      encryptionKey = current.slice("--key=".length);
      continue;
    }
    if (current.startsWith("-")) {
      throw new Error(`Unknown option: ${current}`);
    }
    if (!positionalSeen) {
      rootDir = current;
      positionalSeen = true;
      continue;
    }
    throw new Error(`Unexpected argument: ${current}`);
  }

  return {
    rootDir,
    outputDir: outputDir ?? path.join(process.cwd(), "md-task-viewer-readonly"),
    encryptionKey
  };
}
