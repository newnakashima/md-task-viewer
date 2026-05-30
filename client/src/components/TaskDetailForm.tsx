import { type ReactElement, useEffect, useState } from "react";
import { slugify } from "~/slugify";
import type {
  CommandStep,
  DraftTask,
  Notice,
  Priority,
  Status,
  TaskRecord
} from "../types";
import { formatDate } from "../utils";
import { CopyPathButton } from "./CopyPathButton";
import { CommandStepEditor } from "./CommandStepEditor";
import { MarkdownBodyEditor } from "./MarkdownBodyEditor";

export function TaskDetailForm({
  draft,
  setDraft,
  selectedTask,
  taskDirs,
  pathManuallyEdited,
  setPathManuallyEdited,
  busy,
  notice,
  onSave,
  onDelete,
  onCancel,
  onPatchField,
  onCopyPath,
  onUploadImage,
  onUploadError
}: {
  draft: DraftTask;
  setDraft: (next: DraftTask | null) => void;
  selectedTask: TaskRecord | null;
  taskDirs: string[];
  pathManuallyEdited: boolean;
  setPathManuallyEdited: (next: boolean) => void;
  busy: boolean;
  notice: Notice;
  onSave: () => void;
  onDelete: () => void;
  onCancel: () => void;
  onPatchField: (field: "priority" | "status", value: string) => void;
  onCopyPath: (path: string) => void;
  onUploadImage: (file: File) => Promise<{ markdown: string }>;
  onUploadError: (message: string) => void;
}): ReactElement {
  const [bodyFullHeight, setBodyFullHeight] = useState<boolean>(false);
  const [showCommandOverride, setShowCommandOverride] = useState<boolean>(false);

  useEffect(() => {
    setBodyFullHeight(false);
    setShowCommandOverride(false);
  }, [draft.originalPath]);

  return (
    <div className="task-form">
      {!bodyFullHeight ? (
        <>
          <div className="field-row field-row-top">
            <label>
              <span>Priority</span>
              <select
                value={draft.priority}
                onChange={(event) => {
                  const value = event.target.value as Priority;
                  setDraft({ ...draft, priority: value });
                  if (draft.originalPath) {
                    onPatchField("priority", value);
                  }
                }}
              >
                <option value="MUST">MUST</option>
                <option value="WANT">WANT</option>
              </select>
            </label>

            <label>
              <span>Status</span>
              <select
                value={draft.status}
                onChange={(event) => {
                  const value = event.target.value as Status;
                  setDraft({ ...draft, status: value });
                  if (draft.originalPath) {
                    onPatchField("status", value);
                  }
                }}
              >
                <option value="TODO">TODO</option>
                <option value="DONE">DONE</option>
              </select>
            </label>
          </div>

          <label>
            <span>Title</span>
            <input
              value={draft.title}
              onChange={(event) => {
                const newTitle = event.target.value;
                const updates: Partial<DraftTask> = { title: newTitle };
                if (!pathManuallyEdited && draft.originalPath === null) {
                  const dir = taskDirs[0] || "";
                  const dirPath = dir ? `${dir}/` : "";
                  updates.path = newTitle.trim()
                    ? `${dirPath}${slugify(newTitle)}.md`
                    : dirPath;
                }
                setDraft({ ...draft, ...updates });
              }}
              placeholder="Write release notes"
              required
            />
          </label>

          <label>
            <span className="field-label-row">
              <span>Relative path</span>
              {draft.path ? (
                <CopyPathButton
                  path={draft.path}
                  onCopy={onCopyPath}
                  className="field-label-copy"
                  label="Copy"
                />
              ) : null}
            </span>
            <input
              value={draft.path}
              onChange={(event) => {
                setPathManuallyEdited(true);
                setDraft({ ...draft, path: event.target.value });
              }}
              placeholder="planning/release-notes.md"
            />
          </label>

          <div className="meta-strip">
            <span>Created {formatDate(draft.createdAt)}</span>
            <span>Updated {formatDate(draft.updatedAt)}</span>
          </div>
        </>
      ) : null}

      <MarkdownBodyEditor
        value={draft.content}
        onChange={(next) => setDraft({ ...draft, content: next })}
        bodyFullHeight={bodyFullHeight}
        onToggleBodyFullHeight={() => setBodyFullHeight(!bodyFullHeight)}
        selectedPath={selectedTask?.path ?? null}
        mdPath={draft.path}
        onUploadImage={onUploadImage}
        onUploadError={onUploadError}
      />

      {draft.originalPath ? (
        <>
          <button
            type="button"
            className="collapsible-header"
            onClick={() => setShowCommandOverride(!showCommandOverride)}
          >
            <span className={`collapsible-chevron${showCommandOverride ? " open" : ""}`}>&#9654;</span>
            Command Override
          </button>
          {showCommandOverride ? (
            <div className="collapsible-body">
              <CommandStepEditor
                steps={
                  Array.isArray(draft.extraFrontmatter.commands) && draft.extraFrontmatter.commands.length > 0
                    ? (draft.extraFrontmatter.commands as CommandStep[])
                    : [{ command: "" }]
                }
                onChange={(steps) => {
                  const hasContent = steps.some((s) => s.command.trim());
                  setDraft({
                    ...draft,
                    extraFrontmatter: {
                      ...draft.extraFrontmatter,
                      commands: hasContent ? steps : undefined
                    }
                  });
                }}
                showPassBody={true}
              />
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  const { commands: _, ...rest } = draft.extraFrontmatter;
                  setDraft({ ...draft, extraFrontmatter: rest });
                }}
              >
                Reset to Global
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      <div className="form-actions">
        <button type="button" className="primary-button" disabled={busy} onClick={onSave}>
          {draft.originalPath ? "Save Task" : "Create Task"}
        </button>
        {draft.originalPath ? (
          <button type="button" className="danger-button" disabled={busy} onClick={onDelete}>
            Delete
          </button>
        ) : (
          <button type="button" className="ghost-button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>

      <p className={`notice notice--${notice.tone}`} role={notice.tone === "error" ? "alert" : undefined}>
        {notice.tone === "error" && notice.message ? <span className="notice-icon" aria-hidden="true">!</span> : null}
        {notice.message}
      </p>
    </div>
  );
}
