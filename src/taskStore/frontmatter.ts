import matter from "gray-matter";
import path from "node:path";
import { promises as fs } from "node:fs";
import {
  type TaskFrontmatter,
  type TaskPriority,
  type TaskRecord,
  type TaskStatus
} from "../types.js";
import { ValidationError } from "./errors.js";
import { toPosixPath } from "./paths.js";

const REQUIRED_PRIORITY: TaskPriority[] = ["MUST", "WANT"];
const REQUIRED_STATUS: TaskStatus[] = ["TODO", "DONE"];

export function isValidPriority(value: unknown): value is TaskPriority {
  return REQUIRED_PRIORITY.includes(value as TaskPriority);
}

export function isValidStatus(value: unknown): value is TaskStatus {
  return REQUIRED_STATUS.includes(value as TaskStatus);
}

export function ensureRequiredStatus(status: string): TaskStatus {
  if (!isValidStatus(status)) {
    throw new ValidationError("Status must be TODO or DONE.");
  }
  return status;
}

export function asUtcISOString(date: Date): string {
  return date.toISOString();
}

export function buildDefaults(filePath: string, stats: { birthtime: Date; mtime: Date }): TaskFrontmatter {
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

export function splitFrontmatter(data: Record<string, unknown>, statsDefaults: TaskFrontmatter): {
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
  const priority = isValidPriority(data.priority) ? data.priority : statsDefaults.priority;
  const status = isValidStatus(data.status) ? data.status : statsDefaults.status;
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
