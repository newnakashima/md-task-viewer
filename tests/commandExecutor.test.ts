import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { substituteVariables, executeCommandPipeline } from "../src/commandExecutor.js";
import type { TaskRecord } from "../src/types.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "md-cmd-exec-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(async (dir) => import("node:fs/promises").then(({ rm }) => rm(dir, { recursive: true, force: true }))));
});

function makeTask(overrides?: Partial<TaskRecord>): TaskRecord {
  return {
    path: "tasks/test-task.md",
    content: "Task body content",
    raw: "",
    normalized: false,
    extraFrontmatter: {},
    frontmatter: {
      title: "Test Task",
      priority: "MUST",
      status: "TODO",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z"
    },
    ...overrides
  };
}

describe("substituteVariables", () => {
  it("replaces $TASK_TITLE", () => {
    expect(substituteVariables("echo $TASK_TITLE", { TASK_TITLE: "My Task", TASK_FILEPATH: "/a", TASK_BODY: "b" }))
      .toBe('echo My Task');
  });

  it("replaces ${TASK_FILEPATH}", () => {
    expect(substituteVariables("cat ${TASK_FILEPATH}", { TASK_TITLE: "t", TASK_FILEPATH: "/path/to/file.md", TASK_BODY: "b" }))
      .toBe("cat /path/to/file.md");
  });

  it("replaces multiple variables in one string", () => {
    const result = substituteVariables("echo $TASK_TITLE ${TASK_BODY}", { TASK_TITLE: "T", TASK_FILEPATH: "/f", TASK_BODY: "Body" });
    expect(result).toBe("echo T Body");
  });
});

describe("executeCommandPipeline", () => {
  it("executes a single command", async () => {
    const rootDir = await createTempDir();
    const task = makeTask();
    const result = await executeCommandPipeline(rootDir, [{ command: "echo hello" }], task);
    expect(result.stdout.trim()).toBe("hello");
    expect(result.exitCode).toBe(0);
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it("substitutes variables in commands", async () => {
    const rootDir = await createTempDir();
    const task = makeTask();
    const result = await executeCommandPipeline(rootDir, [{ command: "echo $TASK_TITLE" }], task);
    expect(result.stdout.trim()).toBe("Test Task");
  });

  it("pipes stdout between commands", async () => {
    const rootDir = await createTempDir();
    const task = makeTask();
    const result = await executeCommandPipeline(
      rootDir,
      [
        { command: "echo hello" },
        { command: "tr h H" }
      ],
      task
    );
    expect(result.stdout.trim()).toBe("Hello");
    expect(result.exitCode).toBe(0);
  });

  it("passes task body via stdin when passBody is stdin", async () => {
    const rootDir = await createTempDir();
    const task = makeTask({ content: "stdin content" });
    const result = await executeCommandPipeline(rootDir, [{ command: "cat", passBody: "stdin" }], task);
    expect(result.stdout).toBe("stdin content");
  });

  it("passes task body as argument when passBody is arg", async () => {
    const rootDir = await createTempDir();
    const task = makeTask({ content: "arg content" });
    const result = await executeCommandPipeline(rootDir, [{ command: "echo", passBody: "arg" }], task);
    expect(result.stdout.trim()).toBe("arg content");
  });

  it("propagates non-zero exit code", async () => {
    const rootDir = await createTempDir();
    const task = makeTask();
    const result = await executeCommandPipeline(rootDir, [{ command: "exit 42" }], task);
    expect(result.exitCode).toBe(42);
  });

  it("returns empty result for empty steps", async () => {
    const rootDir = await createTempDir();
    const task = makeTask();
    const result = await executeCommandPipeline(rootDir, [], task);
    expect(result.stdout).toBe("");
    expect(result.exitCode).toBe(0);
  });
});
