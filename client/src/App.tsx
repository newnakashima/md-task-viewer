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
      <span className={`badge badge-${task.frontmatter.priority.toLowerCase()}`}>{task.frontmatter.priority}</span>
      <span className={`badge badge-status badge-${task.frontmatter.status.toLowerCase()}`}>{task.frontmatter.status}</span>
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

export function App(): ReactElement {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [errors, setErrors] = useState<TaskError[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftTask | null>(null);
  const [notice, setNotice] = useState<string>("Loading tasks...");
  const [busy, setBusy] = useState<boolean>(false);

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

  useEffect(() => {
    void loadTasks();
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
        <div>
          <p className="eyebrow">Markdown Task Viewer v0</p>
          <h1>Local tasks, direct file control.</h1>
        </div>
        <button
          type="button"
          className="primary-button"
          onClick={() =>
            setDraft({
              originalPath: null,
              path: "",
              title: "",
              priority: "WANT",
              status: "TODO",
              content: "",
              extraFrontmatter: {}
            })
          }
        >
          New Task
        </button>
      </header>

      <main className="layout-grid">
        <section className="panel">
          <div className="panel-header">
            <h2>Tasks</h2>
            <span>{tasks.length} items</span>
          </div>

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
                  onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                  placeholder="Write release notes"
                  required
                />
              </label>

              <label>
                <span>Relative path</span>
                <input
                  value={draft.path}
                  onChange={(event) => setDraft({ ...draft, path: event.target.value })}
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
                  rows={18}
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
            </div>
          ) : (
            <div className="empty-editor">
              <p>Select a task to edit it, or create a new one.</p>
            </div>
          )}

          {notice ? <p className="notice">{notice}</p> : null}
        </section>
      </main>
    </div>
  );
}
