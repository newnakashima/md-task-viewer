export type Priority = "MUST" | "WANT";
export type Status = "TODO" | "DONE";

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

export interface TaskRecord {
  path: string;
  content: string;
  frontmatter: {
    title: string;
    priority: Priority;
    status: Status;
    createdAt: string;
    updatedAt: string;
  };
  extraFrontmatter: Record<string, unknown>;
}

export interface TaskError {
  path: string;
  message: string;
}

export interface TaskListResponse {
  tasks: TaskRecord[];
  errors: TaskError[];
}

export interface DraftTask {
  originalPath: string | null;
  path: string;
  title: string;
  priority: Priority;
  status: Status;
  content: string;
  updatedAt?: string;
  createdAt?: string;
  extraFrontmatter: Record<string, unknown>;
}

export type NoticeTone = "info" | "success" | "error";

export interface Notice {
  message: string;
  tone: NoticeTone;
}
