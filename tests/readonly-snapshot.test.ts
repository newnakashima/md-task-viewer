import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { collectSnapshot } from "../src/readonly/snapshot.js";
import { CONFIG_FILE_NAME } from "../src/types.js";

async function writeTask(rootDir: string, relativePath: string, title: string): Promise<void> {
  const abs = path.join(rootDir, relativePath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(
    abs,
    `---\ntitle: ${title}\npriority: MUST\nstatus: TODO\ncreatedAt: '2026-01-01T00:00:00.000Z'\nupdatedAt: '2026-01-01T00:00:00.000Z'\n---\n\nBody for ${title}\n`,
    "utf8"
  );
}

describe("readonly/snapshot", () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "md-task-viewer-ro-"));
  });

  afterEach(async () => {
    await fs.rm(rootDir, { recursive: true, force: true });
  });

  it("collects tasks from configured task directories", async () => {
    await writeTask(rootDir, "tasks/alpha.md", "Alpha");
    await writeTask(rootDir, "tasks/beta.md", "Beta");
    await fs.writeFile(
      path.join(rootDir, CONFIG_FILE_NAME),
      JSON.stringify({ version: 1, taskDirs: ["tasks"], ignorePaths: [], order: [] }),
      "utf8"
    );

    const snapshot = await collectSnapshot(rootDir);
    expect(snapshot.tasks.map((t) => t.path).sort()).toEqual(["tasks/alpha.md", "tasks/beta.md"]);
    expect(snapshot.errors).toEqual([]);
    expect(snapshot.version).toBe(1);
    expect(typeof snapshot.generatedAt).toBe("string");
  });

  it("respects the order array from .md-task-viewer.json", async () => {
    await writeTask(rootDir, "tasks/a.md", "A");
    await writeTask(rootDir, "tasks/b.md", "B");
    await writeTask(rootDir, "tasks/c.md", "C");
    await fs.writeFile(
      path.join(rootDir, CONFIG_FILE_NAME),
      JSON.stringify({
        version: 1,
        taskDirs: ["tasks"],
        ignorePaths: [],
        order: ["tasks/c.md", "tasks/a.md", "tasks/b.md"]
      }),
      "utf8"
    );

    const snapshot = await collectSnapshot(rootDir);
    expect(snapshot.tasks.map((t) => t.path)).toEqual(["tasks/c.md", "tasks/a.md", "tasks/b.md"]);
  });

  it("does not mutate .md-task-viewer.json (no write side effects)", async () => {
    await writeTask(rootDir, "tasks/x.md", "X");
    const configPath = path.join(rootDir, CONFIG_FILE_NAME);
    const configBody = JSON.stringify({
      version: 1,
      taskDirs: ["tasks"],
      ignorePaths: [],
      // Intentionally stale: order references a missing file and is missing the new one
      order: ["tasks/ghost.md"]
    });
    await fs.writeFile(configPath, configBody, "utf8");
    const beforeStat = await fs.stat(configPath);

    await collectSnapshot(rootDir);
    await new Promise((r) => setTimeout(r, 10));

    const after = await fs.readFile(configPath, "utf8");
    const afterStat = await fs.stat(configPath);
    expect(after).toBe(configBody);
    expect(afterStat.mtimeMs).toBe(beforeStat.mtimeMs);
  });

  it("reports parse errors instead of throwing", async () => {
    await writeTask(rootDir, "tasks/good.md", "Good");
    const badPath = path.join(rootDir, "tasks/bad.md");
    await fs.mkdir(path.dirname(badPath), { recursive: true });
    await fs.writeFile(badPath, "---\nnot: [valid\n---\nbody", "utf8");
    await fs.writeFile(
      path.join(rootDir, CONFIG_FILE_NAME),
      JSON.stringify({ version: 1, taskDirs: ["tasks"], ignorePaths: [], order: [] }),
      "utf8"
    );

    const snapshot = await collectSnapshot(rootDir);
    expect(snapshot.tasks.map((t) => t.path)).toContain("tasks/good.md");
    expect(snapshot.errors.map((e) => e.path)).toContain("tasks/bad.md");
  });
});
