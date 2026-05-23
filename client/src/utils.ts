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
