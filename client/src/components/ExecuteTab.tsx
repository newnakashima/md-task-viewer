import { type ReactElement } from "react";
import type {
  CommandExecutionResult,
  CommandStep,
  DraftTask,
  Notice,
  TaskRecord
} from "../types";

export function ExecuteTab({
  draft,
  selectedTask,
  globalCommands,
  executing,
  executionResult,
  notice,
  onExecute,
  onCopyStdout
}: {
  draft: DraftTask;
  selectedTask: TaskRecord | null;
  globalCommands: CommandStep[];
  executing: boolean;
  executionResult: CommandExecutionResult | null;
  notice: Notice;
  onExecute: (commands: CommandStep[]) => void;
  onCopyStdout: (stdout: string) => void;
}): ReactElement {
  const savedTaskCmds =
    selectedTask &&
    Array.isArray(selectedTask.extraFrontmatter.commands) &&
    selectedTask.extraFrontmatter.commands.length > 0
      ? (selectedTask.extraFrontmatter.commands as CommandStep[])
      : null;
  const resolvedCmds = savedTaskCmds ?? (globalCommands.length > 0 ? globalCommands : []);
  const source = savedTaskCmds ? "Task override" : "Global";

  // `draft` is currently used only to keep this component re-rendering with App's draft cycle;
  // future enhancements may surface draft-derived fields here.
  void draft;

  return (
    <div className="execute-panel">
      {resolvedCmds.length > 0 ? (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.72rem", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.06em" }}>
              Commands ({source})
            </span>
          </div>
          <div className="execute-commands">
            {resolvedCmds.map((step, index) => (
              <div key={index} className="execute-command-item">
                <span className="command-index">{index + 1}.</span>
                <code>{step.command}</code>
                {step.passBody && index === 0 ? (
                  <span className="pass-body-badge">{step.passBody}</span>
                ) : null}
              </div>
            ))}
          </div>
          <div className="form-actions">
            <button
              type="button"
              className="primary-button"
              disabled={executing}
              onClick={() => onExecute(resolvedCmds)}
            >
              {executing ? "Executing..." : "Execute"}
            </button>
          </div>
        </>
      ) : (
        <p className="execute-no-commands">No commands configured. Set commands in Settings or in the task&apos;s Command Override section.</p>
      )}

      {executionResult ? (
        <div className="execution-result">
          <div className="execution-result-header">
            <div className="execution-result-meta">
              <span className={executionResult.exitCode !== 0 ? "exit-code-error" : ""}>
                Exit: {executionResult.exitCode}
              </span>
              <span>{executionResult.duration}ms</span>
            </div>
            <button
              type="button"
              className="ghost-button copy-button"
              onClick={() => onCopyStdout(executionResult.stdout)}
            >
              Copy
            </button>
          </div>
          <pre>{executionResult.stdout}</pre>
          {executionResult.stderr ? (
            <pre className="execution-stderr">{executionResult.stderr}</pre>
          ) : null}
          <p className={`notice notice--${notice.tone}`} role={notice.tone === "error" ? "alert" : undefined}>
            {notice.tone === "error" && notice.message ? <span className="notice-icon" aria-hidden="true">!</span> : null}
            {notice.message}
          </p>
        </div>
      ) : null}
    </div>
  );
}
