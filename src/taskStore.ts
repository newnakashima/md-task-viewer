import matter from "gray-matter";
import picomatch from "picomatch";
import path from "node:path";
import { promises as fs } from "node:fs";
import {
  CONFIG_FILE_NAME,
  type CommandStep,
  type ConfigFile,
  type CreateTaskInput,
  type PatchTaskFieldsInput,
  type TaskFrontmatter,
  type TaskListResponse,
  type TaskParseError,
  type TaskPriority,
  type TaskRecord,
  type TaskStatus,
  type UpdateTaskInput
} from "./types.js";
import { slugify } from "./slugify.js";

const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown"]);
const REQUIRED_PRIORITY: TaskPriority[] = ["MUST", "WANT"];
const REQUIRED_STATUS: TaskStatus[] = ["TODO", "WIP", "DONE"];

export class ConflictError extends Error {}
export class ValidationError extends Error {}

function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

function normalizeRelativePath(candidate: string): string {
  const normalized = toPosixPath(path.posix.normalize(candidate.trim()));
  if (!normalized || normalized === "." || normalized.startsWith("../") || normalized.includes("/../")) {
    throw new ValidationError("Path must stay within the workspace root.");
  }

  return normalized.replace(/^\.\/+/, "");
}

function ensureMarkdownExtension(filePath: string): string {
  return path.posix.extname(filePath) ? filePath : `${filePath}.md`;
}

function asUtcISOString(date: Date): string {
  return date.toISOString();
}

function buildDefaults(filePath: string, stats: { birthtime: Date; mtime: Date }): TaskFrontmatter {
  const basename = path.basename(filePath, path.extname(filePath));
  const title = basename.replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());

  return {
    title,
    priority: "WANT",
    status: "TODO",
    createdAt: asUtcISOString(stats.birthtime),
    updatedAt: asUtcISOString(stats.mtime)
  };
}

function splitFrontmatter(data: Record<string, unknown>, statsDefaults: TaskFrontmatter): {
  frontmatter: TaskFrontmatter;
  extraFrontmatter: Record<string, unknown>;
  normalized: boolean;
} {
  const extraFrontmatter: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (!["title", "priority", "status", "createdAt", "updatedAt"].includes(key)) {
      extraFrontmatter[key] = value;
    }
  }

  const title = typeof data.title === "string" && data.title.trim() ? data.title : statsDefaults.title;
  const priority = REQUIRED_PRIORITY.includes(data.priority as TaskPriority)
    ? (data.priority as TaskPriority)
    : statsDefaults.priority;
  const status = REQUIRED_STATUS.includes(data.status as TaskStatus)
    ? (data.status as TaskStatus)
    : statsDefaults.status;
  const createdAt =
    typeof data.createdAt === "string" && !Number.isNaN(Date.parse(data.createdAt))
      ? new Date(data.createdAt).toISOString()
      : statsDefaults.createdAt;
  const updatedAt =
    typeof data.updatedAt === "string" && !Number.isNaN(Date.parse(data.updatedAt))
      ? new Date(data.updatedAt).toISOString()
      : statsDefaults.updatedAt;

  const normalized =
    title !== data.title ||
    priority !== data.priority ||
    status !== data.status ||
    createdAt !== data.createdAt ||
    updatedAt !== data.updatedAt;

  return {
    frontmatter: { title, priority, status, createdAt, updatedAt },
    extraFrontmatter,
    normalized
  };
}

export function serializeTask(record: TaskRecord): string {
  const data = {
    ...record.extraFrontmatter,
    title: record.frontmatter.title,
    priority: record.frontmatter.priority,
    status: record.frontmatter.status,
    createdAt: record.frontmatter.createdAt,
    updatedAt: record.frontmatter.updatedAt
  };

  return matter.stringify(record.content, data);
}

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

async function listMarkdownFiles(rootDir: string, taskDirs: string[], ignorePaths: string[]): Promise<string[]> {
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

export async function parseTask(rootDir: string, relativePath: string): Promise<TaskRecord> {
  const absolutePath = path.join(rootDir, relativePath);
  const raw = await fs.readFile(absolutePath, "utf8");
  const stats = await fs.stat(absolutePath);
  const parsed = matter(raw);
  const defaults = buildDefaults(relativePath, stats);
  const { frontmatter, extraFrontmatter, normalized } = splitFrontmatter(parsed.data, defaults);

  return {
    path: toPosixPath(relativePath),
    content: parsed.content,
    frontmatter,
    extraFrontmatter,
    raw,
    normalized
  };
}

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

async function reconcileOrder(rootDir: string, taskPaths: string[]): Promise<{ order: string[]; changed: boolean }> {
  const config = await readConfig(rootDir);
  const order = config.order;

  const known = new Set(taskPaths);
  const orderSet = new Set(order);

  const newItems = taskPaths.filter((p) => !orderSet.has(p));

  // Build next order: keep existing items, replace removed slots with new items
  const nextOrder: string[] = [];
  let newItemCursor = 0;
  for (let i = 0; i < order.length; i++) {
    if (known.has(order[i])) {
      nextOrder.push(order[i]);
    } else if (newItemCursor < newItems.length) {
      nextOrder.push(newItems[newItemCursor++]);
    }
    // else: removed item with no replacement — skip
  }
  // Append any remaining new items that didn't fill a removed slot
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
  const payload: ConfigFile = { version: 1, taskDirs: existing.taskDirs, ignorePaths: existing.ignorePaths, order: normalized, commands: existing.commands };
  await fs.writeFile(path.join(rootDir, CONFIG_FILE_NAME), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export async function saveConfig(rootDir: string, taskDirs: string[], ignorePaths?: string[], commands?: CommandStep[]): Promise<ConfigFile> {
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
  const payload: ConfigFile = { version: 1, taskDirs: validated, ignorePaths: validatedIgnorePaths, order: existing.order, commands: validatedCommands };
  await fs.writeFile(path.join(rootDir, CONFIG_FILE_NAME), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return payload;
}

export async function listTasks(rootDir: string): Promise<TaskListResponse> {
  const config = await readConfig(rootDir);
  const files = await listMarkdownFiles(rootDir, config.taskDirs, config.ignorePaths);
  const errors: TaskParseError[] = [];
  const tasks = await Promise.all(
    files.map(async (relativePath) => {
      try {
        return await parseTask(rootDir, relativePath);
      } catch (error) {
        errors.push({
          path: relativePath,
          message: error instanceof Error ? error.message : "Unknown parse error"
        });
        return null;
      }
    })
  );

  const taskRecords = tasks.filter((task): task is TaskRecord => task !== null);
  const { order, changed } = await reconcileOrder(
    rootDir,
    taskRecords.map((task) => task.path)
  );

  if (changed) {
    await saveOrder(rootDir, order);
  }

  const orderIndex = new Map(order.map((item, index) => [item, index]));
  taskRecords.sort((left, right) => {
    const leftIndex = orderIndex.get(left.path) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = orderIndex.get(right.path) ?? Number.MAX_SAFE_INTEGER;
    return leftIndex - rightIndex || left.path.localeCompare(right.path);
  });

  return { tasks: taskRecords, errors };
}

async function ensureDirectoryForFile(rootDir: string, relativeFilePath: string): Promise<string> {
  const normalized = ensureMarkdownExtension(normalizeRelativePath(relativeFilePath));
  const absolutePath = path.join(rootDir, normalized);
  const directory = path.dirname(absolutePath);
  await fs.mkdir(directory, { recursive: true });
  return normalized;
}

async function nextAvailablePath(rootDir: string, directory: string, title: string): Promise<string> {
  const safeDirectory = directory ? normalizeRelativePath(directory) : "";
  const slug = slugify(title);
  const base = safeDirectory ? `${safeDirectory}/${slug}` : slug;

  let attempt = 0;
  while (true) {
    const candidate = ensureMarkdownExtension(attempt === 0 ? base : `${base}-${attempt + 1}`);
    try {
      await fs.access(path.join(rootDir, candidate));
      attempt += 1;
    } catch {
      return candidate;
    }
  }
}

export async function createTask(rootDir: string, input: CreateTaskInput): Promise<TaskRecord> {
  if (!input.title.trim()) {
    throw new ValidationError("Title is required.");
  }

  const now = asUtcISOString(new Date());
  const relativePath = input.path?.trim()
    ? await ensureDirectoryForFile(rootDir, input.path)
    : await nextAvailablePath(rootDir, input.directory ?? "", input.title);
  const absolutePath = path.join(rootDir, relativePath);

  try {
    await fs.access(absolutePath);
  } catch (error) {
    const maybeError = error as NodeJS.ErrnoException;
    if (maybeError.code === "ENOENT") {
      // The target path is available.
    } else if (maybeError.code) {
      throw error;
    } else {
      throw new ValidationError("A task already exists at that path.");
    }
  }

  const record: TaskRecord = {
    path: relativePath,
    content: input.content ?? "",
    raw: "",
    normalized: false,
    extraFrontmatter: input.extraFrontmatter ?? {},
    frontmatter: {
      title: input.title.trim(),
      priority: input.priority ?? "MUST",
      status: input.status ?? "TODO",
      createdAt: now,
      updatedAt: now
    }
  };

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, serializeTask(record), "utf8");

  const current = await listTasks(rootDir);
  await saveOrder(rootDir, current.tasks.map((task) => task.path).concat(relativePath));
  return parseTask(rootDir, relativePath);
}

export async function updateTask(rootDir: string, currentPath: string, input: UpdateTaskInput): Promise<TaskRecord> {
  const normalizedCurrentPath = ensureMarkdownExtension(normalizeRelativePath(currentPath));
  const absoluteCurrentPath = path.join(rootDir, normalizedCurrentPath);

  let existing: TaskRecord;
  try {
    existing = await parseTask(rootDir, normalizedCurrentPath);
  } catch (error) {
    const maybeError = error as NodeJS.ErrnoException;
    if (maybeError.code === "ENOENT") {
      throw new ConflictError("The task no longer exists.");
    }
    throw error;
  }

  if (input.baseUpdatedAt && existing.frontmatter.updatedAt !== input.baseUpdatedAt) {
    throw new ConflictError("The task changed on disk. Reload before saving.");
  }

  const nextPath = input.path?.trim()
    ? await ensureDirectoryForFile(rootDir, input.path)
    : normalizedCurrentPath;
  const absoluteNextPath = path.join(rootDir, nextPath);

  if (nextPath !== normalizedCurrentPath) {
    try {
      await fs.access(absoluteNextPath);
    } catch (error) {
      const maybeError = error as NodeJS.ErrnoException;
      if (maybeError.code === "ENOENT") {
        // The target path is available.
      } else if (maybeError.code) {
        throw error;
      } else {
        throw new ValidationError("A task already exists at the target path.");
      }
    }
  }

  const record: TaskRecord = {
    path: nextPath,
    raw: existing.raw,
    normalized: false,
    content: input.content,
    extraFrontmatter: input.extraFrontmatter ?? existing.extraFrontmatter,
    frontmatter: {
      title: input.title.trim(),
      priority: input.priority,
      status: input.status,
      createdAt: existing.frontmatter.createdAt,
      updatedAt: asUtcISOString(new Date())
    }
  };

  await fs.writeFile(absoluteCurrentPath, serializeTask(record), "utf8");
  if (nextPath !== normalizedCurrentPath) {
    await fs.mkdir(path.dirname(absoluteNextPath), { recursive: true });
    await fs.rename(absoluteCurrentPath, absoluteNextPath);
  }

  if (nextPath !== normalizedCurrentPath) {
    const config = await readConfig(rootDir);
    const updatedOrder = config.order.map((item) => item === normalizedCurrentPath ? nextPath : item);
    if (!updatedOrder.includes(nextPath)) {
      updatedOrder.push(nextPath);
    }
    await saveOrder(rootDir, updatedOrder);
  }
  return parseTask(rootDir, nextPath);
}

export async function deleteTask(rootDir: string, relativePath: string): Promise<void> {
  const normalizedPath = ensureMarkdownExtension(normalizeRelativePath(relativePath));
  const absolutePath = path.join(rootDir, normalizedPath);

  try {
    await fs.unlink(absolutePath);
  } catch (error) {
    const maybeError = error as NodeJS.ErrnoException;
    if (maybeError.code === "ENOENT") {
      throw new ConflictError("The task no longer exists.");
    }
    throw error;
  }

  const current = await listTasks(rootDir);
  await saveOrder(
    rootDir,
    current.tasks.map((task) => task.path)
  );
}

export async function patchTaskFields(rootDir: string, currentPath: string, input: PatchTaskFieldsInput): Promise<TaskRecord> {
  const normalizedCurrentPath = ensureMarkdownExtension(normalizeRelativePath(currentPath));
  const absoluteCurrentPath = path.join(rootDir, normalizedCurrentPath);

  let existing: TaskRecord;
  try {
    existing = await parseTask(rootDir, normalizedCurrentPath);
  } catch (error) {
    const maybeError = error as NodeJS.ErrnoException;
    if (maybeError.code === "ENOENT") {
      throw new ConflictError("The task no longer exists.");
    }
    throw error;
  }

  const priority = input.priority && REQUIRED_PRIORITY.includes(input.priority) ? input.priority : existing.frontmatter.priority;
  const status = input.status && REQUIRED_STATUS.includes(input.status) ? input.status : existing.frontmatter.status;

  if (priority === existing.frontmatter.priority && status === existing.frontmatter.status) {
    return existing;
  }

  const record: TaskRecord = {
    path: normalizedCurrentPath,
    raw: existing.raw,
    normalized: false,
    content: existing.content,
    extraFrontmatter: existing.extraFrontmatter,
    frontmatter: {
      ...existing.frontmatter,
      priority,
      status,
      updatedAt: asUtcISOString(new Date())
    }
  };

  await fs.writeFile(absoluteCurrentPath, serializeTask(record), "utf8");
  return parseTask(rootDir, normalizedCurrentPath);
}

export function parseOrderPayload(input: unknown): string[] {
  if (!Array.isArray(input)) {
    throw new ValidationError("Order payload must be an array.");
  }

  return input.map((item) => ensureMarkdownExtension(normalizeRelativePath(String(item))));
}

export async function readOrder(rootDir: string): Promise<ConfigFile> {
  const config = await readConfig(rootDir);
  const { order } = await reconcileOrder(
    rootDir,
    (await listTasks(rootDir)).tasks.map((task) => task.path)
  );
  return { version: 1, taskDirs: config.taskDirs, ignorePaths: config.ignorePaths, order, commands: config.commands };
}

export const taskStoreUtils = {
  slugify,
  normalizeRelativePath,
  ensureMarkdownExtension,
  splitFrontmatter,
  buildDefaults
};
