import path from "node:path";
import { promises as fs } from "node:fs";
import {
  type ConfigFile,
  type CreateTaskInput,
  type PatchTaskFieldsInput,
  type TaskListResponse,
  type TaskParseError,
  type TaskRecord,
  type UpdateTaskInput
} from "../types.js";
import { slugify } from "../slugify.js";
import { ConflictError, ValidationError } from "./errors.js";
import { ensureMarkdownExtension, normalizeRelativePath } from "./paths.js";
import {
  asUtcISOString,
  ensureRequiredStatus,
  isValidPriority,
  isValidStatus,
  parseTask,
  serializeTask
} from "./frontmatter.js";
import { listMarkdownFiles } from "./scanner.js";
import { readConfig, reconcileOrder, saveOrder } from "./config.js";

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

export async function createTask(rootDir: string, input: CreateTaskInput): Promise<TaskRecord> {
  if (!input.title.trim()) {
    throw new ValidationError("Title is required.");
  }
  const status = input.status !== undefined ? ensureRequiredStatus(input.status) : "TODO";

  const now = asUtcISOString(new Date());
  const relativePath = input.path?.trim()
    ? await ensureDirectoryForFile(rootDir, input.path)
    : await nextAvailablePath(rootDir, input.directory ?? "", input.title);
  const absolutePath = path.join(rootDir, relativePath);

  let targetExists = false;
  try {
    await fs.access(absolutePath);
    targetExists = true;
  } catch (error) {
    const maybeError = error as NodeJS.ErrnoException;
    if (maybeError.code !== "ENOENT") {
      throw error;
    }
  }
  if (targetExists) {
    throw new ValidationError("A task already exists at that path.");
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
      status,
      createdAt: now,
      updatedAt: now
    }
  };

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, serializeTask(record), "utf8");

  const config = await readConfig(rootDir);
  const filteredOrder = config.order.filter((item) => item !== relativePath);
  await saveOrder(rootDir, [relativePath, ...filteredOrder]);
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
  const status = ensureRequiredStatus(input.status);

  const nextPath = input.path?.trim()
    ? await ensureDirectoryForFile(rootDir, input.path)
    : normalizedCurrentPath;
  const absoluteNextPath = path.join(rootDir, nextPath);

  if (nextPath !== normalizedCurrentPath) {
    let targetExists = false;
    try {
      await fs.access(absoluteNextPath);
      targetExists = true;
    } catch (error) {
      const maybeError = error as NodeJS.ErrnoException;
      if (maybeError.code !== "ENOENT") {
        throw error;
      }
    }
    if (targetExists) {
      throw new ValidationError("A task already exists at the target path.");
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
      status,
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
    const filteredOrder = config.order.filter((item) => item !== nextPath);
    const index = filteredOrder.indexOf(normalizedCurrentPath);

    let updatedOrder: string[];
    if (index === -1) {
      // If the old path is not present, just append the new path.
      updatedOrder = [...filteredOrder, nextPath];
    } else {
      // Replace the old path with the new path at the same position.
      updatedOrder = [...filteredOrder];
      updatedOrder[index] = nextPath;
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

export async function patchTaskFields(
  rootDir: string,
  currentPath: string,
  input: PatchTaskFieldsInput
): Promise<TaskRecord> {
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

  const priority = input.priority && isValidPriority(input.priority) ? input.priority : existing.frontmatter.priority;
  const status = input.status && isValidStatus(input.status) ? input.status : existing.frontmatter.status;

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

export async function readOrder(rootDir: string): Promise<ConfigFile> {
  const config = await readConfig(rootDir);
  const { order } = await reconcileOrder(
    rootDir,
    (await listTasks(rootDir)).tasks.map((task) => task.path)
  );
  return { version: 1, taskDirs: config.taskDirs, ignorePaths: config.ignorePaths, order, commands: config.commands };
}
