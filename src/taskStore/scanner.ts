import picomatch from "picomatch";
import path from "node:path";
import { promises as fs } from "node:fs";
import { CONFIG_FILE_NAME } from "../types.js";
import { toPosixPath } from "./paths.js";

const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown"]);

async function readDirectoryRecursive(rootDir: string, currentDir: string, results: string[]): Promise<void> {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "node_modules") {
      continue;
    }

    const absolutePath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      await readDirectoryRecursive(rootDir, absolutePath, results);
      continue;
    }

    if (entry.name === CONFIG_FILE_NAME) {
      continue;
    }

    if (!MARKDOWN_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      continue;
    }

    results.push(toPosixPath(path.relative(rootDir, absolutePath)));
  }
}

export async function listMarkdownFiles(rootDir: string, taskDirs: string[], ignorePaths: string[]): Promise<string[]> {
  const results: string[] = [];
  const seen = new Set<string>();

  const isIgnored = ignorePaths.length > 0 ? picomatch(ignorePaths) : null;

  for (const taskDir of taskDirs) {
    const scanDir = path.resolve(rootDir, taskDir);
    try {
      await fs.access(scanDir);
    } catch {
      continue;
    }
    const dirResults: string[] = [];
    await readDirectoryRecursive(rootDir, scanDir, dirResults);
    for (const filePath of dirResults) {
      if (!seen.has(filePath)) {
        seen.add(filePath);
        if (isIgnored && isIgnored(filePath)) {
          continue;
        }
        results.push(filePath);
      }
    }
  }

  return results.sort();
}
