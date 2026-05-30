import type { DraftTask, TaskRecord } from "./types";

export const isMac = /Mac|iPhone|iPod|iPad/.test(navigator.userAgent);

export function formatDate(value?: string): string {
  if (!value) {
    return "-";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Failed to read file."));
        return;
      }
      const comma = result.indexOf(",");
      resolve(comma === -1 ? result : result.slice(comma + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

function dirnamePosix(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const slash = normalized.lastIndexOf("/");
  return slash === -1 ? "" : normalized.slice(0, slash);
}

function normalizePosix(filePath: string): string {
  const segments: string[] = [];
  for (const segment of filePath.split("/")) {
    if (segment === "" || segment === ".") {
      continue;
    }
    if (segment === "..") {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join("/");
}

/**
 * Resolve a relative image `src` (as written in a markdown body) against the
 * directory of `mdPath`, returning the live server URL that serves it.
 * Absolute, protocol, data, and fragment URLs are returned unchanged.
 */
export function resolveAssetUrl(mdPath: string, src: string): string {
  if (!src || /^[a-z]+:/i.test(src) || src.startsWith("/") || src.startsWith("#")) {
    return src;
  }
  const joined = normalizePosix(`${dirnamePosix(mdPath)}/${src}`);
  if (!joined) {
    return src;
  }
  return `/api/assets/${joined.split("/").map(encodeURIComponent).join("/")}`;
}

export function draftFromTask(task: TaskRecord): DraftTask {
  return {
    originalPath: task.path,
    path: task.path,
    title: task.frontmatter.title,
    priority: task.frontmatter.priority,
    status: task.frontmatter.status,
    content: task.content,
    updatedAt: task.frontmatter.updatedAt,
    createdAt: task.frontmatter.createdAt,
    extraFrontmatter: task.extraFrontmatter
  };
}
