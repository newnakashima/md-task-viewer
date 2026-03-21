import { spawn } from "node:child_process";
import path from "node:path";
import type { CommandStep, CommandExecutionResult, TaskRecord } from "./types.js";

const TIMEOUT_MS = 30_000;

const VARIABLE_PATTERN = /\$\{?(TASK_TITLE|TASK_FILEPATH|TASK_BODY)\}?/g;

export function substituteVariables(command: string, vars: Record<string, string>): string {
  return command.replace(VARIABLE_PATTERN, (_match, name: string) => vars[name] ?? "");
}

export async function executeCommandPipeline(
  rootDir: string,
  steps: CommandStep[],
  task: TaskRecord
): Promise<CommandExecutionResult> {
  if (steps.length === 0) {
    return { stdout: "", stderr: "", exitCode: 0, duration: 0 };
  }

  const absoluteFilePath = path.resolve(rootDir, task.path);
  const vars: Record<string, string> = {
    TASK_TITLE: task.frontmatter.title,
    TASK_FILEPATH: absoluteFilePath,
    TASK_BODY: task.content
  };

  const startTime = Date.now();

  return new Promise<CommandExecutionResult>((resolve) => {
    const resolvedCommands = steps.map((step, index) => {
      let cmd = substituteVariables(step.command, vars);
      if (index === 0 && step.passBody === "arg") {
        const escaped = task.content.replace(/'/g, "'\\''");
        cmd = `${cmd} '${escaped}'`;
      }
      return cmd;
    });

    const processes: ReturnType<typeof spawn>[] = [];
    for (let index = 0; index < resolvedCommands.length; index++) {
      const proc = spawn(resolvedCommands[index], {
        shell: true,
        cwd: rootDir,
        stdio: ["pipe", "pipe", "pipe"]
      });

      // pipe stdout of previous process to stdin of current
      if (index > 0) {
        const prev = processes[index - 1];
        if (prev?.stdout) {
          prev.stdout.pipe(proc.stdin!);
        }
      }

      processes.push(proc);
    }

    // Handle first command's passBody option
    const firstStep = steps[0];
    const firstProc = processes[0];
    if (firstStep.passBody === "stdin" && firstProc.stdin) {
      firstProc.stdin.write(task.content);
    }
    // Always close first process stdin (body written above if passBody is stdin)
    firstProc.stdin?.end();

    const lastProc = processes[processes.length - 1];
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    lastProc.stdout?.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    lastProc.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    // Collect stderr from all intermediate processes too
    for (let i = 0; i < processes.length - 1; i++) {
      processes[i].stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
    }

    const timeout = setTimeout(() => {
      for (const proc of processes) {
        proc.kill("SIGTERM");
      }
    }, TIMEOUT_MS);

    lastProc.on("close", (code) => {
      clearTimeout(timeout);
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        exitCode: code ?? 1,
        duration: Date.now() - startTime
      });
    });

    lastProc.on("error", (err) => {
      clearTimeout(timeout);
      resolve({
        stdout: "",
        stderr: err.message,
        exitCode: 1,
        duration: Date.now() - startTime
      });
    });

    // Handle errors on intermediate processes
    for (let i = 0; i < processes.length - 1; i++) {
      processes[i].on("error", (err) => {
        stderrChunks.push(Buffer.from(err.message));
      });
    }
  });
}
