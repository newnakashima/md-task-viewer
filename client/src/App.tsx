import { type ReactElement, useEffect, useMemo, useState } from "react";
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

type Priority = "MUST" | "WANT";
type Status = "TODO" | "WIP" | "DONE";

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

function SettingsPanel({
  taskDirs,
  busy,
  onSave,
  onClose
}: {
  taskDirs: string[];
  busy: boolean;
  onSave: (dirs: string[]) => void;
  onClose: () => void;
}): ReactElement {
  const [dirs, setDirs] = useState<string[]>(taskDirs);

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
                <button
                  type="button"
                  className="ghost-button settings-remove-button"
                  onClick={() => removeDir(index)}
                  disabled={dirs.length <= 1}
                  title="Remove"
                >
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="ghost-button" onClick={addDir}>+ Add directory</button>
        </div>
        <div className="form-actions">
          <button
            type="button"
            className="primary-button"
            disabled={busy || dirs.every((d) => !d.trim())}
            onClick={() => onSave(dirs.filter((d) => d.trim()))}
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
  const [notice, setNotice] = useState<string>("Loading tasks...");
  const [busy, setBusy] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [taskDirs, setTaskDirs] = useState<string[]>(["."]);
  const [pathManuallyEdited, setPathManuallyEdited] = useState<boolean>(false);

  const selectedTask = useMemo(
    () => tasks.find((task) => task.path === selectedPath) ?? null,
    [selectedPath, tasks]
  );

  const sensors = useSensors(
    useSensor(PointerSensor),
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
      const config = await requestJson<{ taskDirs: string[] }>("/api/config");
      setTaskDirs(config.taskDirs);
    } catch {
      // use defaults
    }
  }

  async function saveTaskDirs(dirs: string[]): Promise<void> {
    setBusy(true);
    try {
      const config = await requestJson<{ taskDirs: string[] }>("/api/config", {
        method: "PUT",
        body: JSON.stringify({ taskDirs: dirs })
      });
      setTaskDirs(config.taskDirs);
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
    if (!selectedTask) {
      if (!draft?.originalPath) {
        setDraft((current) => current ?? null);
      }
      return;
    }

    setDraft((current) => {
      if (!current || current.originalPath !== selectedTask.path) {
        return draftFromTask(selectedTask);
      }
      return current;
    });
  }, [selectedTask]);

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

  const isDirty =
    !!draft &&
    (draft.originalPath === null ||
      draft.path !== draft.originalPath ||
      draft.title !== selectedTask?.frontmatter.title ||
      draft.priority !== selectedTask?.frontmatter.priority ||
      draft.status !== selectedTask?.frontmatter.status ||
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
              setPathManuallyEdited(false);
              setDraft({
                originalPath: null,
                path: taskDirs[0] ? `${taskDirs[0]}/` : "",
                title: "",
                priority: "WANT",
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
            <span>{tasks.length} items</span>
          </div>

          <div className="sidebar-scroll">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => void handleDragEnd(event)}>
              <SortableContext items={tasks.map((task) => task.path)} strategy={verticalListSortingStrategy}>
                <div className="task-list">
                  {tasks.map((task) => (
                    <SortableTaskItem
                      key={task.path}
                      task={task}
                      selected={task.path === selectedPath}
                      onSelect={setSelectedPath}
                    />
                  ))}
                  {tasks.length === 0 ? <p className="empty-list">No tasks yet. Create your first markdown task.</p> : null}
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

          {draft ? (
            <div className="task-form">
              <label>
                <span>Title</span>
                <input
                  value={draft.title}
                  onChange={(event) => {
                    const newTitle = event.target.value;
                    const updates: Partial<DraftTask> = { title: newTitle };
                    if (!pathManuallyEdited && draft.originalPath === null) {
                      const dir = taskDirs[0] || "";
                      updates.path = newTitle.trim()
                        ? `${dir}/${newTitle}.md`
                        : `${dir}/`;
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

              <div className="field-row">
                <label>
                  <span>Priority</span>
                  <select
                    value={draft.priority}
                    onChange={(event) => setDraft({ ...draft, priority: event.target.value as Priority })}
                  >
                    <option value="MUST">MUST</option>
                    <option value="WANT">WANT</option>
                  </select>
                </label>

                <label>
                  <span>Status</span>
                  <select
                    value={draft.status}
                    onChange={(event) => setDraft({ ...draft, status: event.target.value as Status })}
                  >
                    <option value="TODO">TODO</option>
                    <option value="WIP">WIP</option>
                    <option value="DONE">DONE</option>
                  </select>
                </label>
              </div>

              <div className="meta-strip">
                <span>Created {formatDate(draft.createdAt)}</span>
                <span>Updated {formatDate(draft.updatedAt)}</span>
              </div>

              <label className="editor-label">
                <span>Markdown body</span>
                <textarea
                  value={draft.content}
                  onChange={(event) => setDraft({ ...draft, content: event.target.value })}
                  placeholder="# Notes"
                />
              </label>

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

              {notice ? <p className="notice">{notice}</p> : null}
            </div>
          ) : (
            <div className="empty-editor">
              <p>Select a task to edit it, or create a new one.</p>
            </div>
          )}
        </section>
      </main>

      {showSettings ? (
        <SettingsPanel
          taskDirs={taskDirs}
          busy={busy}
          onSave={(dirs) => {
            void saveTaskDirs(dirs);
            setShowSettings(false);
          }}
          onClose={() => setShowSettings(false)}
        />
      ) : null}
    </div>
  );
}
