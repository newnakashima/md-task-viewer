import path from "node:path";
import { promises as fs } from "node:fs";
import { randomBytes } from "node:crypto";
import { slugify } from "../slugify.js";
import { ValidationError } from "./errors.js";
import { ensureMarkdownExtension, normalizeRelativePath, toPosixPath } from "./paths.js";

export interface SaveImageInput {
  /**
   * Workspace-relative path of the markdown file the image belongs to. May be a
   * not-yet-saved path (e.g. "tasks/" or "tasks/foo.md"); only its directory is
   * used to decide where the image is stored.
   */
  taskPath: string;
  /** Original filename from the client, used to derive a readable slug. */
  filename: string;
  /** Base64-encoded image bytes. A `data:` URL prefix is tolerated. */
  dataBase64: string;
  /** Optional MIME type hint from the client. */
  contentType?: string;
}

export interface SaveImageResult {
  /** Workspace-relative path of the saved image, e.g. "tasks/assets/foo-ab12cd34.png". */
  relPath: string;
  /** Markdown snippet to insert, relative to the markdown file, e.g. "![](assets/foo-ab12cd34.png)". */
  markdown: string;
  /** Server URL the live client uses to render the image. */
  url: string;
}

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

// svg is intentionally unsupported: it can carry scripts and assets are served
// directly, so we only accept raster formats.
const CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp"
};

const ALLOWED_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp"]);

export const ASSET_CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp"
};

/**
 * Resolve the `assets/` directory that sits next to the markdown file. The
 * image link written into the body is therefore always `assets/<name>`,
 * regardless of how deeply the markdown file is nested.
 */
function assetDirForTask(taskPath: string): string {
  const trimmed = (taskPath ?? "").trim().replace(/\\/g, "/");

  let dir: string;
  if (!trimmed || trimmed === "." || trimmed === "./") {
    dir = "";
  } else if (trimmed.endsWith("/")) {
    dir = trimmed.replace(/\/+$/, "");
  } else {
    const parent = path.posix.dirname(ensureMarkdownExtension(trimmed));
    dir = parent === "." ? "" : parent;
  }

  dir = dir.replace(/^\.\/+/, "");
  if (dir === ".." || dir.startsWith("../") || dir.includes("/../")) {
    throw new ValidationError("Task path must stay within the workspace root.");
  }

  return dir ? `${dir}/assets` : "assets";
}

function resolveExtension(input: SaveImageInput): string {
  const contentType = (input.contentType ?? "").toLowerCase().split(";")[0].trim();
  if (contentType && CONTENT_TYPE_EXTENSIONS[contentType]) {
    return CONTENT_TYPE_EXTENSIONS[contentType];
  }

  const originalExt = path.posix.extname(input.filename ?? "").replace(/^\./, "").toLowerCase();
  if (originalExt && ALLOWED_EXTENSIONS.has(originalExt)) {
    return originalExt === "jpeg" ? "jpg" : originalExt;
  }

  throw new ValidationError("Unsupported image type. Allowed: png, jpeg, gif, webp.");
}

function decodeBase64(input: string): Buffer {
  if (typeof input !== "string" || !input.trim()) {
    throw new ValidationError("Image data is required.");
  }
  const comma = input.indexOf(",");
  const base64 = input.startsWith("data:") && comma !== -1 ? input.slice(comma + 1) : input;
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length === 0) {
    throw new ValidationError("Image data is empty or invalid.");
  }
  return buffer;
}

function fileNameStem(filename: string): string {
  const base = path.posix.basename((filename ?? "").replace(/\\/g, "/"));
  const stem = base.replace(/\.[^.]*$/, "");
  const slug = slugify(stem).toLowerCase();
  // slugify returns "untitled-task" for empty or non-slugifiable input
  return slug && slug !== "untitled-task" ? slug : "image";
}

export async function saveImageAsset(rootDir: string, input: SaveImageInput): Promise<SaveImageResult> {
  const extension = resolveExtension(input);
  const data = decodeBase64(input.dataBase64);
  if (data.length > MAX_IMAGE_BYTES) {
    throw new ValidationError(`Image exceeds the ${MAX_IMAGE_BYTES / (1024 * 1024)}MB limit.`);
  }

  const assetDir = assetDirForTask(input.taskPath);
  const stem = fileNameStem(input.filename);
  const name = `${stem}-${randomBytes(4).toString("hex")}.${extension}`;
  const relPath = normalizeRelativePath(`${assetDir}/${name}`);
  const absolutePath = path.join(rootDir, relPath);

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, data);

  return {
    relPath: toPosixPath(relPath),
    markdown: `![](assets/${name})`,
    url: `/api/assets/${relPath.split("/").map(encodeURIComponent).join("/")}`
  };
}
