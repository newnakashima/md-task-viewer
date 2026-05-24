import { readConfig } from "../taskStore/config.js";
import { parseTask } from "../taskStore/frontmatter.js";
import { listMarkdownFiles } from "../taskStore/scanner.js";
import type { TaskListResponse, TaskParseError, TaskRecord } from "../types.js";

export interface ReadOnlySnapshot {
  version: 1;
  generatedAt: string;
  tasks: TaskRecord[];
  errors: TaskParseError[];
}

export async function collectSnapshot(rootDir: string): Promise<ReadOnlySnapshot> {
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

  const records = tasks.filter((task): task is TaskRecord => task !== null);
  const orderIndex = new Map(config.order.map((item, index) => [item, index]));
  records.sort((left, right) => {
    const leftIndex = orderIndex.get(left.path) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = orderIndex.get(right.path) ?? Number.MAX_SAFE_INTEGER;
    return leftIndex - rightIndex || left.path.localeCompare(right.path);
  });

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    tasks: records,
    errors
  };
}

export function toListResponse(snapshot: ReadOnlySnapshot): TaskListResponse {
  return { tasks: snapshot.tasks, errors: snapshot.errors };
}
