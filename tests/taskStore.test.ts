import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  listTasks,
  parseTask,
  saveOrder,
  serializeTask,
  taskStoreUtils
} from "../src/taskStore.js";
import type { TaskRecord } from "../src/types.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "md-task-viewer-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(async (dir) => import("node:fs/promises").then(({ rm }) => rm(dir, { recursive: true, force: true }))));
});

describe("taskStore", () => {
  it("preserves unknown frontmatter keys when serializing", () => {
    const record: TaskRecord = {
      path: "task.md",
      raw: "",
      normalized: false,
      content: "# Notes\n",
      extraFrontmatter: { owner: "alice", estimate: 3 },
      frontmatter: {
        title: "Task",
        priority: "MUST",
        status: "WIP",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-02T00:00:00.000Z"
      }
    };

    const output = serializeTask(record);
    expect(output).toContain("owner: alice");
    expect(output).toContain("estimate: 3");
    expect(output).toContain("# Notes");
  });

  it("creates stable slugs and normalizes empty input", () => {
    expect(taskStoreUtils.slugify("Ship v0.1 Today!")).toBe("Ship-v01-Today");
    expect(taskStoreUtils.slugify("  ")).toBe("untitled-task");
  });

  it("reconciles order file against current tasks", async () => {
    const rootDir = await createTempDir();
    await writeFile(
      path.join(rootDir, "alpha.md"),
      "---\ntitle: Alpha\npriority: MUST\nstatus: TODO\ncreatedAt: 2024-01-01T00:00:00.000Z\nupdatedAt: 2024-01-01T00:00:00.000Z\n---\nA",
      "utf8"
    );
    await writeFile(
      path.join(rootDir, "beta.md"),
      "---\ntitle: Beta\npriority: WANT\nstatus: DONE\ncreatedAt: 2024-01-01T00:00:00.000Z\nupdatedAt: 2024-01-01T00:00:00.000Z\n---\nB",
      "utf8"
    );
    await saveOrder(rootDir, ["beta.md", "missing.md"]);

    const payload = await listTasks(rootDir);
    expect(payload.tasks.map((task) => task.path)).toEqual(["beta.md", "alpha.md"]);

    const orderFile = await readFile(path.join(rootDir, ".md-task-viewer.json"), "utf8");
    expect(orderFile).toContain('"order": [\n    "beta.md",\n    "alpha.md"\n  ]');
  });

  it("fills defaults for missing required keys", async () => {
    const rootDir = await createTempDir();
    await writeFile(path.join(rootDir, "ideas.md"), "---\nowner: alice\n---\nBrainstorm", "utf8");

    const task = await parseTask(rootDir, "ideas.md");
    expect(task.frontmatter.title).toBe("Ideas");
    expect(task.frontmatter.priority).toBe("WANT");
    expect(task.frontmatter.status).toBe("TODO");
    expect(task.extraFrontmatter).toEqual({ owner: "alice" });
  });
});
