import { type ReactElement, useEffect, useMemo, useRef, useState } from "react";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { slugify } from "~/slugify";

const isMac = /Mac|iPhone|iPod|iPad/.test(navigator.userAgent);

type Priority = "MUST" | "WANT";
type Status = "TODO" | "WIP" | "DONE";

interface CommandStep {
  command: string;
  passBody?: "arg" | "stdin" | false;
}

interface CommandExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
}

interface TaskRecord {
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

interface TaskError {
  path: string;
  message: string;
}

interface TaskListResponse {
  tasks: TaskRecord[];
  errors: TaskError[];
}

interface DraftTask {
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

function formatDate(value?: string): string {
  if (!value) {
    return "-";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function draftFromTask(task: TaskRecord): DraftTask {
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

function SortableTaskItem({
  task,
  selected,
  onSelect
}: {
  task: TaskRecord;
  selected: boolean;
  onSelect: (path: string) => void;
}): ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: task.path });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  return (
    <button
      ref={setNodeRef}
      style={style}
      type="button"
      className={`task-row${selected ? " task-row-selected" : ""}`}
      onClick={() => onSelect(task.path)}
      {...attributes}
      {...listeners}
    >
      <span className="task-row-badges">
        <span className={`badge badge-${task.frontmatter.priority.toLowerCase()}`}>{task.frontmatter.priority}</span>
        <span className={`badge badge-${task.frontmatter.status.toLowerCase()}`}>{task.frontmatter.status}</span>
      </span>
      <strong>{task.frontmatter.title}</strong>
      <small>{task.path}</small>
      <small>Updated {formatDate(task.frontmatter.updatedAt)}</small>
    </button>
  );
}

async function requestJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(input, {
    headers,
    ...init
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Request failed: ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function RemoveButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }): ReactElement {
  return (
    <button
      type="button"
      className="ghost-button settings-remove-button"
      onClick={onClick}
      disabled={disabled}
      title="Remove"
    >
      <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
      </svg>
    </button>
  );
}

function CommandStepEditor({
  steps,
  onChange,
  showPassBody
}: {
  steps: CommandStep[];
  onChange: (steps: CommandStep[]) => void;
  showPassBody: boolean;
}): ReactElement {
  function updateStep(index: number, field: keyof CommandStep, value: string | false): void {
    const next = [...steps];
    next[index] = { ...next[index], [field]: value };
    onChange(next);
  }

  return (
    <>
      <div className="settings-dir-list">
        {steps.map((step, index) => (
          <div key={index} className="command-step-row">
            <input
              value={step.command}
              onChange={(e) => updateStep(index, "command", e.target.value)}
              placeholder={`e.g. echo $TASK_TITLE`}
            />
            {showPassBody && index === 0 ? (
              <select
                value={step.passBody === false ? "false" : (step.passBody || "false")}
                onChange={(e) => {
                  const v = e.target.value;
                  updateStep(index, "passBody", v === "false" ? false : v);
                }}
                title="Pass task body"
              >
                <option value="false">No body</option>
                <option value="arg">Body as arg</option>
                <option value="stdin">Body as stdin</option>
              </select>
            ) : null}
            <RemoveButton onClick={() => onChange(steps.filter((_, i) => i !== index))} disabled={steps.length <= 1} />
          </div>
        ))}
      </div>
      <button type="button" className="ghost-button" onClick={() => onChange([...steps, { command: "" }])}>+ Add command</button>
    </>
  );
}

function SettingsPanel({
  taskDirs,
  ignorePaths,
  commands,
  busy,
  onSave,
  onClose
}: {
  taskDirs: string[];
  ignorePaths: string[];
  commands: CommandStep[];
  busy: boolean;
  onSave: (dirs: string[], ignorePaths: string[], commands: CommandStep[]) => void;
  onClose: () => void;
}): ReactElement {
  const [dirs, setDirs] = useState<string[]>(taskDirs);
  const [ignorePatterns, setIgnorePatterns] = useState<string[]>(ignorePaths.length > 0 ? ignorePaths : [""]);
  const [cmdSteps, setCmdSteps] = useState<CommandStep[]>(commands.length > 0 ? commands : [{ command: "" }]);

  function updateDir(index: number, value: string): void {
    const next = [...dirs];
    next[index] = value;
    setDirs(next);
  }

  function addDir(): void {
    setDirs([...dirs, ""]);
  }

  function removeDir(index: number): void {
    setDirs(dirs.filter((_, i) => i !== index));
  }

  function updateIgnore(index: number, value: string): void {
    const next = [...ignorePatterns];
    next[index] = value;
    setIgnorePatterns(next);
  }

  function addIgnore(): void {
    setIgnorePatterns([...ignorePatterns, ""]);
  }

  function removeIgnore(index: number): void {
    setIgnorePatterns(ignorePatterns.filter((_, i) => i !== index));
  }

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="panel-header">
          <h2>Settings</h2>
          <button type="button" className="ghost-button" onClick={onClose}>Close</button>
        </div>
        <div className="settings-body">
          <label>
            <span className="settings-label">Task directories</span>
            <small className="settings-hint">Directories to scan for .md task files (relative to root)</small>
          </label>
          <div className="settings-dir-list">
            {dirs.map((dir, index) => (
              <div key={index} className="settings-dir-row">
                <input
                  value={dir}
                  onChange={(e) => updateDir(index, e.target.value)}
                  placeholder="e.g. tasks"
                />
                <RemoveButton onClick={() => removeDir(index)} disabled={dirs.length <= 1} />
              </div>
            ))}
          </div>
          <button type="button" className="ghost-button" onClick={addDir}>+ Add directory</button>

          <label>
            <span className="settings-label">Ignore patterns</span>
            <small className="settings-hint">Glob patterns for paths to exclude (e.g. __done__/**, archived/**)</small>
          </label>
          <div className="settings-dir-list">
            {ignorePatterns.map((pattern, index) => (
              <div key={index} className="settings-dir-row">
                <input
                  value={pattern}
                  onChange={(e) => updateIgnore(index, e.target.value)}
                  placeholder="e.g. __done__/**"
                />
                <RemoveButton onClick={() => removeIgnore(index)} disabled={ignorePatterns.length <= 1} />
              </div>
            ))}
          </div>
          <button type="button" className="ghost-button" onClick={addIgnore}>+ Add pattern</button>

          <label>
            <span className="settings-label">Commands</span>
            <small className="settings-hint">Commands to execute against tasks. Variables: $TASK_TITLE, $TASK_FILEPATH, $TASK_BODY</small>
          </label>
          <CommandStepEditor steps={cmdSteps} onChange={setCmdSteps} showPassBody={true} />
        </div>
        <div className="form-actions">
          <button
            type="button"
            className="primary-button"
            disabled={busy || dirs.every((d) => !d.trim())}
            onClick={() => onSave(
              dirs.filter((d) => d.trim()),
              ignorePatterns.filter((p) => p.trim()),
              cmdSteps.filter((s) => s.command.trim())
            )}
          >
            Save
          </button>
          <button type="button" className="ghost-button" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export function App(): ReactElement {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [errors, setErrors] = useState<TaskError[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftTask | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [notice, setNotice] = useState<string>("Loading tasks...");
  const [busy, setBusy] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [taskDirs, setTaskDirs] = useState<string[]>(["."]);
  const [ignorePaths, setIgnorePaths] = useState<string[]>([]);
  const [pathManuallyEdited, setPathManuallyEdited] = useState<boolean>(false);
  const [hideDone, setHideDone] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<"detail" | "execute">("detail");
  const [globalCommands, setGlobalCommands] = useState<CommandStep[]>([]);
  const [executionResult, setExecutionResult] = useState<CommandExecutionResult | null>(null);
  const [executing, setExecuting] = useState<boolean>(false);
  const [showCommandOverride, setShowCommandOverride] = useState<boolean>(false);
  const [bodyFullHeight, setBodyFullHeight] = useState<boolean>(false);

  const filteredTasks = useMemo(
    () => (hideDone ? tasks.filter((task) => task.frontmatter.status !== "DONE") : tasks),
    [tasks, hideDone]
  );

  const selectedTask = useMemo(
    () => filteredTasks.find((task) => task.path === selectedPath) ?? null,
    [selectedPath, filteredTasks]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  async function loadTasks(options?: { preserveDraft?: boolean }): Promise<void> {
    const payload = await requestJson<TaskListResponse>("/api/tasks");
    setTasks(payload.tasks);
    setErrors(payload.errors);
    setSelectedPath((current) => {
      if (current && payload.tasks.some((task) => task.path === current)) {
        return current;
      }
      return payload.tasks[0]?.path ?? null;
    });
    if (!options?.preserveDraft) {
      setDraft((currentDraft) => {
        if (currentDraft?.originalPath) {
          const refreshed = payload.tasks.find((task) => task.path === currentDraft.originalPath);
          if (refreshed) {
            return draftFromTask(refreshed);
          }
        }
        return null;
      });
    }
  }

  async function loadConfig(): Promise<void> {
    try {
      const config = await requestJson<{ taskDirs: string[]; ignorePaths: string[]; commands?: CommandStep[] }>("/api/config");
      setTaskDirs(config.taskDirs);
      setIgnorePaths(config.ignorePaths ?? []);
      setGlobalCommands(config.commands ?? []);
    } catch {
      // use defaults
    }
  }

  async function saveSettings(dirs: string[], ignore: string[], commands: CommandStep[]): Promise<void> {
    setBusy(true);
    try {
      const config = await requestJson<{ taskDirs: string[]; ignorePaths: string[]; commands?: CommandStep[] }>("/api/config", {
        method: "PUT",
        body: JSON.stringify({ taskDirs: dirs, ignorePaths: ignore, commands })
      });
      setTaskDirs(config.taskDirs);
      setIgnorePaths(config.ignorePaths ?? []);
      setGlobalCommands(config.commands ?? []);
      setNotice("Settings saved.");
      await loadTasks();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Failed to save settings.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void loadConfig();
    void loadTasks();
    setNotice("Tasks loaded.");
  }, []);

  useEffect(() => {
    if (selectedPath && !filteredTasks.some((t) => t.path === selectedPath)) {
      setSelectedPath(filteredTasks[0]?.path ?? null);
    }
  }, [filteredTasks]);

  useEffect(() => {
    if (!selectedTask) {
      // Clear draft for existing tasks that are no longer visible (e.g., filtered out)
      // Keep draft if it's a new task (originalPath is null)
      if (draft?.originalPath) {
        setDraft(null);
      }
      return;
    }

    const current = draftRef.current;
    if (!current || current.originalPath !== selectedTask.path) {
      setBodyFullHeight(false);
      setDraft(draftFromTask(selectedTask));
    }
  }, [selectedTask]);

  useEffect(() => {
    function handleBodyFullHeightShortcut(e: KeyboardEvent): void {
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.shiftKey && e.key === "H") {
        e.preventDefault();
        setBodyFullHeight((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleBodyFullHeightShortcut);
    return () => window.removeEventListener("keydown", handleBodyFullHeightShortcut);
  }, []);

  useEffect(() => {
    const source = new EventSource("/api/events");
    source.onmessage = () => {
      void loadTasks({ preserveDraft: true });
    };
    source.onerror = () => {
      source.close();
    };
    return () => source.close();
  }, []);

  async function saveDraft(): Promise<void> {
    if (!draft) {
      return;
    }

    setBusy(true);
    setNotice("");
    try {
      if (draft.originalPath) {
        const updated = await requestJson<TaskRecord>(`/api/tasks/${encodeURIComponent(draft.originalPath)}`, {
          method: "PATCH",
          body: JSON.stringify({
            path: draft.path,
            title: draft.title,
            priority: draft.priority,
            status: draft.status,
            content: draft.content,
            extraFrontmatter: draft.extraFrontmatter,
            baseUpdatedAt: draft.updatedAt
          })
        });
        await loadTasks();
        setSelectedPath(updated.path);
        setDraft(draftFromTask(updated));
        setNotice("Task saved.");
      } else {
        const created = await requestJson<TaskRecord>("/api/tasks", {
          method: "POST",
          body: JSON.stringify({
            path: draft.path || undefined,
            title: draft.title,
            priority: draft.priority,
            status: draft.status,
            content: draft.content,
            extraFrontmatter: draft.extraFrontmatter
          })
        });
        await loadTasks();
        setSelectedPath(created.path);
        setDraft(draftFromTask(created));
        setNotice("Task created.");
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Failed to save task.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelectedTask(): Promise<void> {
    if (!draft?.originalPath) {
      return;
    }

    setBusy(true);
    setNotice("");
    try {
      await requestJson<void>(`/api/tasks/${encodeURIComponent(draft.originalPath)}`, {
        method: "DELETE"
      });
      setDraft(null);
      await loadTasks();
      setNotice("Task deleted.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Failed to delete task.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDragEnd(event: DragEndEvent): Promise<void> {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = tasks.findIndex((task) => task.path === active.id);
    const newIndex = tasks.findIndex((task) => task.path === over.id);
    const next = arrayMove(tasks, oldIndex, newIndex);
    setTasks(next);

    try {
      await requestJson<void>("/api/order", {
        method: "PUT",
        body: JSON.stringify({ order: next.map((task) => task.path) })
      });
      setNotice("Task order updated.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Failed to save order.");
      await loadTasks();
    }
  }

  async function patchField(field: "priority" | "status", value: string): Promise<void> {
    if (!draft?.originalPath) {
      return;
    }
    try {
      const updated = await requestJson<TaskRecord>(
        `/api/task-fields/${encodeURIComponent(draft.originalPath)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ [field]: value })
        }
      );
      await loadTasks();
      setSelectedPath(updated.path);
      setDraft((current) => current ? { ...current, [field]: value, updatedAt: updated.frontmatter.updatedAt } : current);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : `Failed to update ${field}.`);
    }
  }

  async function executeCommands(commands: CommandStep[]): Promise<void> {
    if (!draft?.originalPath || commands.length === 0) {
      return;
    }
    setExecuting(true);
    setExecutionResult(null);
    try {
      const result = await requestJson<CommandExecutionResult>("/api/execute", {
        method: "POST",
        body: JSON.stringify({ taskPath: draft.originalPath, commands })
      });
      setExecutionResult(result);
    } catch (error) {
      setExecutionResult({
        stdout: "",
        stderr: error instanceof Error ? error.message : "Execution failed.",
        exitCode: 1,
        duration: 0
      });
    } finally {
      setExecuting(false);
    }
  }

  const isDirty =
    !!draft &&
    (draft.originalPath === null ||
      draft.path !== draft.originalPath ||
      draft.title !== selectedTask?.frontmatter.title ||
      draft.content !== selectedTask?.content);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-left">
          <h1>Markdown Task Viewer</h1>
          <p className="eyebrow">v0</p>
        </div>
        <div className="app-header-actions">
          <button
            type="button"
            className="ghost-button settings-button"
            onClick={() => setShowSettings(true)}
            title="Settings"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.062 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              setNotice("");
              setPathManuallyEdited(false);
              setDraft({
                originalPath: null,
                path: taskDirs[0] ? `${taskDirs[0]}/` : "",
                title: "",
                priority: "MUST",
                status: "TODO",
                content: "",
                extraFrontmatter: {}
              });
            }}
          >
            New Task
          </button>
        </div>
      </header>

      <main className="layout-grid">
        <section className="panel">
          <div className="panel-header">
            <h2>Tasks</h2>
            <span className="panel-header-right">
              <label className="filter-toggle">
                <input type="checkbox" checked={hideDone} onChange={() => setHideDone(!hideDone)} />
                <span>Hide DONE</span>
              </label>
              <span>{filteredTasks.length} items</span>
            </span>
          </div>

          <div className="sidebar-scroll">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => void handleDragEnd(event)}>
              <SortableContext items={filteredTasks.map((task) => task.path)} strategy={verticalListSortingStrategy}>
                <div className="task-list">
                  {filteredTasks.map((task) => (
                    <SortableTaskItem
                      key={task.path}
                      task={task}
                      selected={task.path === selectedPath}
                      onSelect={(path) => {
                        setSelectedPath(path);
                        setActiveTab("detail");
                        setExecutionResult(null);
                        setShowCommandOverride(false);
                        const target = tasks.find((t) => t.path === path);
                        if (target) {
                          setDraft(draftFromTask(target));
                        }
                      }}
                    />
                  ))}
                  {filteredTasks.length === 0 ? <p className="empty-list">{hideDone ? "No active tasks." : "No tasks yet. Create your first markdown task."}</p> : null}
                </div>
              </SortableContext>
            </DndContext>

            {errors.length > 0 ? (
              <div className="error-panel">
                <h3>Unreadable Markdown</h3>
                {errors.map((error) => (
                  <p key={error.path}>
                    <strong>{error.path}</strong>
                    <span>{error.message}</span>
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        <section className="panel editor-panel">
          <div className="panel-header">
            <h2>{draft?.originalPath ? "Edit Task" : "Task Details"}</h2>
            {isDirty ? <span className="dirty-state">Unsaved changes</span> : null}
          </div>

          {draft?.originalPath ? (
            <div className="tab-bar">
              <button
                type="button"
                className={`tab-button${activeTab === "detail" ? " active" : ""}`}
                onClick={() => setActiveTab("detail")}
              >
                Detail
              </button>
              <button
                type="button"
                className={`tab-button${activeTab === "execute" ? " active" : ""}`}
                onClick={() => setActiveTab("execute")}
              >
                Execute
              </button>
            </div>
          ) : null}

          {draft && activeTab === "detail" ? (
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
                            void patchField("priority", value);
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
                            void patchField("status", value);
                          }
                        }}
                      >
                        <option value="TODO">TODO</option>
                        <option value="WIP">WIP</option>
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
                    <span>Relative path</span>
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

              <label className="editor-label">
                <span className="editor-label-header">
                  <span>Markdown body</span>
                  <button
                    type="button"
                    className="ghost-button body-fullheight-button"
                    aria-pressed={bodyFullHeight}
                    onClick={() => setBodyFullHeight(!bodyFullHeight)}
                    title={`${isMac ? "Cmd" : "Ctrl"}+Shift+H`}
                  >
                    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                      {bodyFullHeight ? (
                        <path fillRule="evenodd" d="M3 12a1 1 0 011-1h2a1 1 0 011 1v2.586l3.293-3.293a1 1 0 011.414 1.414L8.414 16H10a1 1 0 110 2H4a1 1 0 01-1-1v-4h0zm14-1a1 1 0 00-1 1v2.586l-3.293-3.293a1 1 0 00-1.414 1.414L14.586 16H13a1 1 0 100 2h4a1 1 0 001-1v-4h0a1 1 0 00-1-1z" clipRule="evenodd" />
                      ) : (
                        <path fillRule="evenodd" d="M3 4a1 1 0 011-1h4a1 1 0 010 2H6.414l3.293 3.293a1 1 0 01-1.414 1.414L5 6.414V8a1 1 0 01-2 0V4zm9 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 11-2 0V6.414l-3.293 3.293a1 1 0 01-1.414-1.414L14.586 5H13a1 1 0 01-1-1zM3 12a1 1 0 011-1h2a1 1 0 011 1v2.586l3.293-3.293a1 1 0 011.414 1.414L8.414 16H10a1 1 0 110 2H4a1 1 0 01-1-1v-4h0zm14-1a1 1 0 00-1 1v2.586l-3.293-3.293a1 1 0 00-1.414 1.414L14.586 16H13a1 1 0 100 2h4a1 1 0 001-1v-4h0a1 1 0 00-1-1z" clipRule="evenodd" />
                      )}
                    </svg>
                    {bodyFullHeight ? "Collapse" : "Expand"} ({isMac ? "\u2318" : "Ctrl+"}⇧H)
                  </button>
                </span>
                <textarea
                  value={draft.content}
                  onChange={(event) => setDraft({ ...draft, content: event.target.value })}
                  onKeyDown={(event) => {
                    if (event.nativeEvent.isComposing) return;

                    const ta = event.currentTarget;
                    const { selectionStart, selectionEnd, value } = ta;

                    if (event.key === "Tab") {
                      event.preventDefault();
                      const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
                      const lineEnd = value.indexOf("\n", selectionEnd);
                      const end = lineEnd === -1 ? value.length : lineEnd;

                      if (selectionStart !== selectionEnd) {
                        // Multi-line indent/dedent
                        const selectedLines = value.slice(lineStart, end);
                        const newLines = selectedLines
                          .split("\n")
                          .map((line) =>
                            event.shiftKey
                              ? line.startsWith("  ") ? line.slice(2) : line
                              : "  " + line
                          )
                          .join("\n");
                        const newValue = value.slice(0, lineStart) + newLines + value.slice(end);
                        setDraft({ ...draft, content: newValue });
                        requestAnimationFrame(() => {
                          ta.selectionStart = lineStart;
                          ta.selectionEnd = lineStart + newLines.length;
                        });
                      } else if (event.shiftKey) {
                        // Shift+Tab: remove 2 spaces from line start
                        const line = value.slice(lineStart, end);
                        if (line.startsWith("  ")) {
                          const newValue = value.slice(0, lineStart) + line.slice(2) + value.slice(end);
                          const newCursor = Math.max(lineStart, selectionStart - 2);
                          setDraft({ ...draft, content: newValue });
                          requestAnimationFrame(() => {
                            ta.selectionStart = ta.selectionEnd = newCursor;
                          });
                        }
                      } else {
                        // Tab: insert 2 spaces at line start
                        const newValue = value.slice(0, lineStart) + "  " + value.slice(lineStart);
                        setDraft({ ...draft, content: newValue });
                        requestAnimationFrame(() => {
                          ta.selectionStart = ta.selectionEnd = selectionStart + 2;
                        });
                      }
                      return;
                    }

                    if (event.key === "Enter") {
                      const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
                      const currentLine = value.slice(lineStart, selectionStart);
                      const listMatch = currentLine.match(/^(\s*)([-*]|\d+\.)\s/);

                      if (listMatch) {
                        event.preventDefault();
                        const [fullMatch, indent, marker] = listMatch;
                        const textAfterMarker = currentLine.slice(fullMatch.length);

                        if (textAfterMarker.trim() === "") {
                          // Empty list item — remove the marker, leave blank line
                          const newValue = value.slice(0, lineStart) + value.slice(selectionStart);
                          setDraft({ ...draft, content: newValue });
                          requestAnimationFrame(() => {
                            ta.selectionStart = ta.selectionEnd = lineStart;
                          });
                        } else {
                          // Continue the list
                          const nextMarker = /^\d+\./.test(marker)
                            ? `${parseInt(marker) + 1}.`
                            : marker;
                          const insertion = `\n${indent}${nextMarker} `;
                          const newValue = value.slice(0, selectionStart) + insertion + value.slice(selectionEnd);
                          const newCursor = selectionStart + insertion.length;
                          setDraft({ ...draft, content: newValue });
                          requestAnimationFrame(() => {
                            ta.selectionStart = ta.selectionEnd = newCursor;
                          });
                        }
                      }
                    }
                  }}
                  placeholder="# Notes"
                />
              </label>

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
                <button type="button" className="primary-button" disabled={busy} onClick={() => void saveDraft()}>
                  {draft.originalPath ? "Save Task" : "Create Task"}
                </button>
                {draft.originalPath ? (
                  <button type="button" className="danger-button" disabled={busy} onClick={() => void deleteSelectedTask()}>
                    Delete
                  </button>
                ) : (
                  <button type="button" className="ghost-button" onClick={() => setDraft(null)}>
                    Cancel
                  </button>
                )}
              </div>

              <p className="notice">{notice}</p>
            </div>
          ) : draft && activeTab === "execute" ? (
            <div className="execute-panel">
              {(() => {
                const savedTaskCmds = selectedTask && Array.isArray(selectedTask.extraFrontmatter.commands) && selectedTask.extraFrontmatter.commands.length > 0
                  ? (selectedTask.extraFrontmatter.commands as CommandStep[])
                  : null;
                const resolvedCmds = savedTaskCmds ?? (globalCommands.length > 0 ? globalCommands : []);
                const source = savedTaskCmds ? "Task override" : "Global";

                return resolvedCmds.length > 0 ? (
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
                          {step.passBody && step.passBody !== false && index === 0 ? (
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
                        onClick={() => void executeCommands(resolvedCmds)}
                      >
                        {executing ? "Executing..." : "Execute"}
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="execute-no-commands">No commands configured. Set commands in Settings or in the task&apos;s Command Override section.</p>
                );
              })()}

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
                      onClick={() => {
                        void navigator.clipboard.writeText(executionResult.stdout);
                        setNotice("Copied to clipboard.");
                      }}
                    >
                      Copy
                    </button>
                  </div>
                  <pre>{executionResult.stdout}</pre>
                  {executionResult.stderr ? (
                    <pre className="execution-stderr">{executionResult.stderr}</pre>
                  ) : null}
                  <p className="notice">{notice}</p>
                </div>
              ) : null}
            </div>
          ) : !draft ? (
            <div className="empty-editor">
              <p>Select a task to edit it, or create a new one.</p>
            </div>
          ) : null}
        </section>
      </main>

      {showSettings ? (
        <SettingsPanel
          taskDirs={taskDirs}
          ignorePaths={ignorePaths}
          commands={globalCommands}
          busy={busy}
          onSave={(dirs, ignore, cmds) => {
            void saveSettings(dirs, ignore, cmds);
            setShowSettings(false);
          }}
          onClose={() => setShowSettings(false)}
        />
      ) : null}
    </div>
  );
}
