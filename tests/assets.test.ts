import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { saveImageAsset } from "../src/taskStore.js";
import { createServer } from "../src/server.js";
import { resolveAssetUrl } from "../client/src/utils.js";

// A minimal valid 1x1 transparent PNG.
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC";

let rootDir: string;
const createdDirs: string[] = [];

beforeEach(async () => {
  rootDir = await mkdtemp(path.join(os.tmpdir(), "md-task-viewer-assets-"));
  createdDirs.push(rootDir);
});

afterEach(async () => {
  await Promise.all(
    createdDirs.splice(0).map(async (dir) =>
      import("node:fs/promises").then(({ rm }) => rm(dir, { recursive: true, force: true }))
    )
  );
});

describe("saveImageAsset", () => {
  it("saves an image into an assets/ dir next to the markdown file", async () => {
    const result = await saveImageAsset(rootDir, {
      taskPath: "tasks/foo.md",
      filename: "My Screenshot.png",
      dataBase64: PNG_BASE64,
      contentType: "image/png"
    });

    expect(result.relPath).toMatch(/^tasks\/assets\/my-screenshot-[0-9a-f]{8}\.png$/);
    expect(result.markdown).toMatch(/^!\[\]\(assets\/my-screenshot-[0-9a-f]{8}\.png\)$/);
    expect(result.url).toBe(`/api/assets/${result.relPath}`);

    const saved = await readFile(path.join(rootDir, result.relPath));
    expect(saved.length).toBeGreaterThan(0);
  });

  it("treats a directory-only task path as the target directory", async () => {
    const result = await saveImageAsset(rootDir, {
      taskPath: "tasks/",
      filename: "image.png",
      dataBase64: PNG_BASE64,
      contentType: "image/png"
    });

    expect(result.relPath.startsWith("tasks/assets/")).toBe(true);
  });

  it("stores at the workspace root assets/ when the task lives at the root", async () => {
    const result = await saveImageAsset(rootDir, {
      taskPath: "foo.md",
      filename: "image.png",
      dataBase64: PNG_BASE64,
      contentType: "image/png"
    });

    expect(result.relPath).toMatch(/^assets\/image-[0-9a-f]{8}\.png$/);
    expect(result.markdown).toMatch(/^!\[\]\(assets\/image-[0-9a-f]{8}\.png\)$/);
  });

  it("derives the extension from the filename when contentType is missing", async () => {
    const result = await saveImageAsset(rootDir, {
      taskPath: "tasks/foo.md",
      filename: "diagram.webp",
      dataBase64: PNG_BASE64
    });

    expect(result.relPath.endsWith(".webp")).toBe(true);
  });

  it("rejects path traversal in the task path", async () => {
    await expect(
      saveImageAsset(rootDir, {
        taskPath: "../evil.md",
        filename: "x.png",
        dataBase64: PNG_BASE64,
        contentType: "image/png"
      })
    ).rejects.toThrow();
  });

  it("rejects unsupported image types (e.g. svg)", async () => {
    await expect(
      saveImageAsset(rootDir, {
        taskPath: "tasks/foo.md",
        filename: "x.svg",
        dataBase64: PNG_BASE64,
        contentType: "image/svg+xml"
      })
    ).rejects.toThrow();
  });

  it("rejects empty image data", async () => {
    await expect(
      saveImageAsset(rootDir, {
        taskPath: "tasks/foo.md",
        filename: "x.png",
        dataBase64: "",
        contentType: "image/png"
      })
    ).rejects.toThrow();
  });

  it("rejects images that exceed the 10MB limit", async () => {
    const bigData = Buffer.alloc(11 * 1024 * 1024, 0).toString("base64");
    await expect(
      saveImageAsset(rootDir, {
        taskPath: "tasks/foo.md",
        filename: "big.png",
        dataBase64: bigData,
        contentType: "image/png"
      })
    ).rejects.toThrow(/10MB/);
  });
});

describe("image upload + asset serving routes", () => {
  it("uploads an image and serves it back", async () => {
    const app = await createServer({ rootDir, clientDir: null });

    const upload = await app.inject({
      method: "POST",
      url: "/api/uploads",
      payload: {
        taskPath: "tasks/foo.md",
        filename: "shot.png",
        contentType: "image/png",
        dataBase64: PNG_BASE64
      }
    });

    expect(upload.statusCode).toBe(201);
    const { url, relPath } = upload.json();
    expect(relPath.startsWith("tasks/assets/")).toBe(true);

    const fetched = await app.inject({ method: "GET", url });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.headers["content-type"]).toContain("image/png");
    expect(fetched.rawPayload.length).toBeGreaterThan(0);

    await app.close();
  });

  it("returns 400 when dataBase64 is missing", async () => {
    const app = await createServer({ rootDir, clientDir: null });

    const upload = await app.inject({
      method: "POST",
      url: "/api/uploads",
      payload: { taskPath: "tasks/foo.md", filename: "shot.png" }
    });

    expect(upload.statusCode).toBe(400);

    await app.close();
  });

  it("does not serve non-image files through /api/assets", async () => {
    const app = await createServer({ rootDir, clientDir: null });

    const response = await app.inject({ method: "GET", url: "/api/assets/tasks/foo.md" });
    expect(response.statusCode).toBe(404);

    await app.close();
  });

  it("returns 404 for a missing asset", async () => {
    const app = await createServer({ rootDir, clientDir: null });

    const response = await app.inject({ method: "GET", url: "/api/assets/tasks/assets/missing.png" });
    expect(response.statusCode).toBe(404);

    await app.close();
  });

  it("blocks path traversal in GET /api/assets", async () => {
    const app = await createServer({ rootDir, clientDir: null });

    const response = await app.inject({
      method: "GET",
      url: "/api/assets/..%2Fpackage.json"
    });
    expect(response.statusCode).toBe(404);

    await app.close();
  });
});

describe("resolveAssetUrl", () => {
  it("rewrites relative src to /api/assets route", () => {
    expect(resolveAssetUrl("tasks/foo.md", "assets/img.png")).toBe(
      "/api/assets/tasks/assets/img.png"
    );
  });

  it("returns absolute URLs unchanged", () => {
    expect(resolveAssetUrl("tasks/foo.md", "https://example.com/img.png")).toBe(
      "https://example.com/img.png"
    );
  });

  it("returns root-relative paths unchanged", () => {
    expect(resolveAssetUrl("tasks/foo.md", "/img.png")).toBe("/img.png");
  });

  it("returns data URIs unchanged", () => {
    const dataUri = "data:image/png;base64,abc";
    expect(resolveAssetUrl("tasks/foo.md", dataUri)).toBe(dataUri);
  });

  it("handles task at workspace root", () => {
    expect(resolveAssetUrl("foo.md", "assets/img.png")).toBe(
      "/api/assets/assets/img.png"
    );
  });

  it("percent-encodes path segments", () => {
    expect(resolveAssetUrl("tasks/my task.md", "assets/my image.png")).toBe(
      "/api/assets/tasks/assets/my%20image.png"
    );
  });
});
