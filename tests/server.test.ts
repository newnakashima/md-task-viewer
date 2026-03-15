import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../src/server.js";

let rootDir: string;
const createdDirs: string[] = [];

beforeEach(async () => {
  rootDir = await mkdtemp(path.join(os.tmpdir(), "md-task-viewer-api-"));
  createdDirs.push(rootDir);
});

afterEach(async () => {
  await Promise.all(
    createdDirs.splice(0).map(async (dir) => import("node:fs/promises").then(({ rm }) => rm(dir, { recursive: true, force: true })))
  );
});

describe("server api", () => {
  it("creates markdown files and order metadata", async () => {
    const app = await createServer({ rootDir, clientDir: null });

    const response = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: {
        title: "First Task",
        priority: "MUST",
        status: "TODO",
        content: "# Hello"
      }
    });

    expect(response.statusCode).toBe(201);
    const createdPath = response.json().path as string;
    const markdown = await readFile(path.join(rootDir, createdPath), "utf8");
    const order = await readFile(path.join(rootDir, ".md-task-viewer-order.json"), "utf8");
    expect(markdown).toContain("title: First Task");
    expect(order).toContain(createdPath);

    await app.close();
  });

  it("updates body, frontmatter, timestamp, and rename", async () => {
    await writeFile(
      path.join(rootDir, "task.md"),
      "---\ntitle: Task\npriority: WANT\nstatus: TODO\ncreatedAt: 2024-01-01T00:00:00.000Z\nupdatedAt: 2024-01-01T00:00:00.000Z\n---\nOld",
      "utf8"
    );
    const app = await createServer({ rootDir, clientDir: null });
    const before = await app.inject({ method: "GET", url: "/api/tasks" });
    const current = before.json().tasks[0];

    const response = await app.inject({
      method: "PATCH",
      url: "/api/tasks/task.md",
      payload: {
        path: "renamed.md",
        title: "Updated Task",
        priority: "MUST",
        status: "WIP",
        content: "New body",
        baseUpdatedAt: current.frontmatter.updatedAt
      }
    });

    expect(response.statusCode).toBe(200);
    const updated = response.json();
    const renamedFile = await readFile(path.join(rootDir, "renamed.md"), "utf8");
    expect(updated.path).toBe("renamed.md");
    expect(renamedFile).toContain("title: Updated Task");
    expect(renamedFile).toContain("status: WIP");
    expect(renamedFile).toContain("New body");
    expect(updated.frontmatter.updatedAt).not.toBe("2024-01-01T00:00:00.000Z");

    await app.close();
  });

  it("deletes tasks and removes them from order", async () => {
    await writeFile(
      path.join(rootDir, "task.md"),
      "---\ntitle: Task\npriority: WANT\nstatus: TODO\ncreatedAt: 2024-01-01T00:00:00.000Z\nupdatedAt: 2024-01-01T00:00:00.000Z\n---\nBody",
      "utf8"
    );
    const app = await createServer({ rootDir, clientDir: null });
    await app.inject({
      method: "PUT",
      url: "/api/order",
      payload: { order: ["task.md"] }
    });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/tasks/task.md"
    });

    expect(response.statusCode).toBe(204);
    const order = await readFile(path.join(rootDir, ".md-task-viewer-order.json"), "utf8");
    expect(order).toContain('"order": []');

    await app.close();
  });

  it("returns 409 when the task was externally removed before save", async () => {
    await writeFile(
      path.join(rootDir, "task.md"),
      "---\ntitle: Task\npriority: WANT\nstatus: TODO\ncreatedAt: 2024-01-01T00:00:00.000Z\nupdatedAt: 2024-01-01T00:00:00.000Z\n---\nBody",
      "utf8"
    );
    const app = await createServer({ rootDir, clientDir: null });
    const before = await app.inject({ method: "GET", url: "/api/tasks" });
    const current = before.json().tasks[0];
    await import("node:fs/promises").then(({ unlink }) => unlink(path.join(rootDir, "task.md")));

    const response = await app.inject({
      method: "PATCH",
      url: "/api/tasks/task.md",
      payload: {
        title: current.frontmatter.title,
        priority: current.frontmatter.priority,
        status: current.frontmatter.status,
        content: "Body",
        baseUpdatedAt: current.frontmatter.updatedAt
      }
    });

    expect(response.statusCode).toBe(409);

    await app.close();
  });
});
