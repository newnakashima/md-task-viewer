import { type ReactElement, useMemo } from "react";
import DOMPurify from "dompurify";
import { marked } from "../markedSetup";
import type { TaskRecord } from "../types";
import { formatDate } from "../utils";
import { CopyPathButton } from "./CopyPathButton";

export function TaskDetailView({
  task,
  onCopyPath
}: {
  task: TaskRecord;
  onCopyPath: (path: string) => void;
}): ReactElement {
  const previewHtml = useMemo(
    () => DOMPurify.sanitize(marked.parse(task.content || "") as string),
    [task.content]
  );

  return (
    <div className="task-form task-form--readonly">
      <div className="field-row field-row-top">
        <span className="readonly-field">
          <span className="readonly-field-label">Priority</span>
          <span className={`badge badge-${task.frontmatter.priority.toLowerCase()}`}>
            {task.frontmatter.priority}
          </span>
        </span>
        <span className="readonly-field">
          <span className="readonly-field-label">Status</span>
          <span className={`badge badge-${task.frontmatter.status.toLowerCase()}`}>
            {task.frontmatter.status}
          </span>
        </span>
      </div>

      <div className="readonly-title">
        <span className="readonly-field-label">Title</span>
        <h3>{task.frontmatter.title}</h3>
      </div>

      <div className="readonly-path">
        <span className="readonly-field-label">Path</span>
        <code>{task.path}</code>
        <CopyPathButton path={task.path} onCopy={onCopyPath} className="field-label-copy" label="Copy" />
      </div>

      <div className="meta-strip">
        <span>Created {formatDate(task.frontmatter.createdAt)}</span>
        <span>Updated {formatDate(task.frontmatter.updatedAt)}</span>
      </div>

      <div className="editor-label">
        <span className="editor-label-header">
          <span>Markdown body</span>
        </span>
        <div className="markdown-preview" dangerouslySetInnerHTML={{ __html: previewHtml }} />
      </div>
    </div>
  );
}
