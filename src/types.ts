export const CONFIG_FILE_NAME = ".md-task-viewer.json";

export type TaskPriority = "MUST" | "WANT";
export type TaskStatus = "TODO" | "WIP" | "DONE";

export interface TaskFrontmatter {
  title: string;
  priority: TaskPriority;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

export interface TaskRecord {
  path: string;
  content: string;
  frontmatter: TaskFrontmatter;
  extraFrontmatter: Record<string, unknown>;
  raw: string;
  normalized: boolean;
}

export interface TaskParseError {
  path: string;
  message: string;
}

export interface TaskListResponse {
  tasks: TaskRecord[];
  errors: TaskParseError[];
}

export interface CreateTaskInput {
  title: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  content?: string;
  directory?: string;
  path?: string;
  extraFrontmatter?: Record<string, unknown>;
}

export interface UpdateTaskInput {
  path?: string;
  title: string;
  priority: TaskPriority;
  status: TaskStatus;
  content: string;
  extraFrontmatter?: Record<string, unknown>;
  baseUpdatedAt?: string;
}

export interface PatchTaskFieldsInput {
  priority?: TaskPriority;
  status?: TaskStatus;
}

export interface CommandStep {
  command: string;
  passBody?: "arg" | "stdin" | false;
}

export interface CommandExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
}

export interface ConfigFile {
  version: number;
  taskDirs: string[];
  ignorePaths: string[];
  order: string[];
  commands?: CommandStep[];
}
