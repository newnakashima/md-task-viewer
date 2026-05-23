import path from "node:path";
import { promises as fs } from "node:fs";
import {
  CONFIG_FILE_NAME,
  type CommandStep,
  type ConfigFile
} from "../types.js";
import { ValidationError } from "./errors.js";
import { ensureMarkdownExtension, normalizeRelativePath } from "./paths.js";

export async function readConfig(rootDir: string): Promise<ConfigFile> {
  const configFilePath = path.join(rootDir, CONFIG_FILE_NAME);

  try {
    const raw = await fs.readFile(configFilePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<ConfigFile>;
    const taskDirs = Array.isArray(parsed.taskDirs)
      ? parsed.taskDirs.filter((item): item is string => typeof item === "string")
      : ["."];
    const ignorePaths = Array.isArray(parsed.ignorePaths)
      ? parsed.ignorePaths.filter((item): item is string => typeof item === "string")
      : [];
    const order = Array.isArray(parsed.order)
      ? parsed.order.filter((item): item is string => typeof item === "string")
      : [];
    const commands = Array.isArray(parsed.commands)
      ? (parsed.commands as CommandStep[])
      : undefined;
    return { version: parsed.version ?? 1, taskDirs, ignorePaths, order, commands };
  } catch (error) {
    const maybeError = error as NodeJS.ErrnoException;
    if (maybeError.code !== "ENOENT") {
      throw error;
    }
    return { version: 1, taskDirs: ["."], ignorePaths: [], order: [] };
  }
}

export async function reconcileOrder(
  rootDir: string,
  taskPaths: string[]
): Promise<{ order: string[]; changed: boolean }> {
  const config = await readConfig(rootDir);
  const order = config.order;

  const known = new Set(taskPaths);
  const orderSet = new Set(order);

  const newItems = taskPaths.filter((p) => !orderSet.has(p));
  const removedCount = order.reduce((count, item) => (known.has(item) ? count : count + 1), 0);
  const canReplace = newItems.length > 0 && newItems.length === removedCount;

  // Build next order:
  // - Always keep existing items in their original relative positions.
  // - Only replace removed slots with new items when the number of removed
  //   items exactly matches the number of new items (rename-like scenario).
  // - Otherwise, skip removed items and append all new items at the end to
  //   avoid unexpected reordering.
  const nextOrder: string[] = [];
  let newItemCursor = 0;
  for (let i = 0; i < order.length; i++) {
    if (known.has(order[i])) {
      nextOrder.push(order[i]);
    } else if (canReplace && newItemCursor < newItems.length) {
      nextOrder.push(newItems[newItemCursor++]);
    }
    // else: removed item with no replacement — skip
  }
  // Append any remaining new items (all of them when we are not in a replace scenario)
  while (newItemCursor < newItems.length) {
    nextOrder.push(newItems[newItemCursor++]);
  }

  const changed = nextOrder.length !== order.length || nextOrder.some((item, index) => item !== order[index]);
  return { order: nextOrder, changed };
}

export async function saveOrder(rootDir: string, order: string[]): Promise<void> {
  const normalized = Array.from(
    new Set(
      order.map((item) => ensureMarkdownExtension(normalizeRelativePath(item)))
    )
  );
  const existing = await readConfig(rootDir);
  const payload: ConfigFile = {
    version: 1,
    taskDirs: existing.taskDirs,
    ignorePaths: existing.ignorePaths,
    order: normalized,
    commands: existing.commands
  };
  await fs.writeFile(path.join(rootDir, CONFIG_FILE_NAME), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export async function saveConfig(
  rootDir: string,
  taskDirs: string[],
  ignorePaths?: string[],
  commands?: CommandStep[]
): Promise<ConfigFile> {
  const validated = taskDirs.map((dir) => {
    const normalized = dir.trim().replace(/\\/g, "/").replace(/\/+$/, "") || ".";
    if (normalized.startsWith("../") || normalized.includes("/../")) {
      throw new ValidationError("taskDirs must stay within the workspace root.");
    }
    return normalized;
  });
  if (validated.length === 0) {
    throw new ValidationError("taskDirs must contain at least one directory.");
  }
  const existing = await readConfig(rootDir);
  const validatedIgnorePaths = ignorePaths ?? existing.ignorePaths;
  const validatedCommands = commands !== undefined ? commands : existing.commands;
  const payload: ConfigFile = {
    version: 1,
    taskDirs: validated,
    ignorePaths: validatedIgnorePaths,
    order: existing.order,
    commands: validatedCommands
  };
  await fs.writeFile(path.join(rootDir, CONFIG_FILE_NAME), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return payload;
}

export function parseOrderPayload(input: unknown): string[] {
  if (!Array.isArray(input)) {
    throw new ValidationError("Order payload must be an array.");
  }

  return input.map((item) => ensureMarkdownExtension(normalizeRelativePath(String(item))));
}
