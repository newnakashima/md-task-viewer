import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

async function findPackageJson(startDir: string): Promise<string> {
  let dir = startDir;
  for (;;) {
    const candidate = path.join(dir, "package.json");
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      const parent = path.dirname(dir);
      if (parent === dir) {
        throw new Error(`Could not locate package.json above ${startDir}`);
      }
      dir = parent;
    }
  }
}

export async function readVersion(packageRoot?: string): Promise<string> {
  const startDir = packageRoot ?? path.dirname(fileURLToPath(import.meta.url));
  const pkgPath = await findPackageJson(startDir);
  const raw = await fs.readFile(pkgPath, "utf8");
  const pkg = JSON.parse(raw) as { version?: unknown };
  if (typeof pkg.version !== "string" || pkg.version.length === 0) {
    throw new Error(`Missing or invalid "version" in ${pkgPath}`);
  }
  return pkg.version;
}

export async function runVersion(): Promise<void> {
  const version = await readVersion();
  process.stdout.write(`${version}\n`);
}
