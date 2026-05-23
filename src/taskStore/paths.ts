import path from "node:path";
import { ValidationError } from "./errors.js";

export function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

export function normalizeRelativePath(candidate: string): string {
  const normalized = toPosixPath(path.posix.normalize(candidate.trim()));
  if (!normalized || normalized === "." || normalized.startsWith("../") || normalized.includes("/../")) {
    throw new ValidationError("Path must stay within the workspace root.");
  }

  return normalized.replace(/^\.\/+/, "");
}

export function ensureMarkdownExtension(filePath: string): string {
  return path.posix.extname(filePath) ? filePath : `${filePath}.md`;
}
