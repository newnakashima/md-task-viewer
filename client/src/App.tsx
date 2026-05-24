import { type ReactElement, useEffect, useMemo, useRef, useState } from "react";
import { type DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";

import type {
  CommandExecutionResult,
  CommandStep,
  DraftTask,
  Notice,
  NoticeTone,
  TaskError,
  TaskRecord
} from "./types";
import { draftFromTask } from "./utils";
import { requestJson } from "./api";
import { IS_ENCRYPTED, IS_READONLY } from "./env";
import {
  DecryptError,
  clearStoredKey,
  loadInitialData,
  readStoredKey,
  storeKey
} from "./dataSource";
import "./markedSetup";
import { SettingsPanel } from "./components/SettingsPanel";
import { TaskListPanel } from "./components/TaskListPanel";
import { TaskDetailForm } from "./components/TaskDetailForm";
import { TaskDetailView } from "./components/TaskDetailView";
import { ExecuteTab } from "./components/ExecuteTab";
import { UnlockModal } from "./components/UnlockModal";

export function App(): ReactElement {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [errors, setErrors] = useState<TaskError[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftTask | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [notice, setNoticeState] = useState<Notice>({
    message: "Loading tasks...",
    tone: "info"
  });
  const setNotice = (message: string, tone: NoticeTone = "info"): void => {
    setNoticeState({ message, tone });
  };
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
  const [unlockKey, setUnlockKey] = useState<string | null>(() => readStoredKey());
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const needsUnlock = IS_READONLY && IS_ENCRYPTED && !unlockKey;

  const filteredTasks = useMemo(
    () => (hideDone ? tasks.filter((task) => task.frontmatter.status !== "DONE") : tasks),
    [tasks, hideDone]
  );

  const selectedTask = useMemo(
    () => filteredTasks.find((task) => task.path === selectedPath) ?? null,
    [selectedPath, filteredTasks]
  );

  async function loadTasks(options?: { preserveDraft?: boolean; announce?: boolean }): Promise<void> {
    try {
      const payload = await loadInitialData(unlockKey);
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
      if (options?.announce) {
        setNotice("Tasks loaded.");
      }
    } catch (error) {
      if (error instanceof DecryptError) {
        clearStoredKey();
        setUnlockKey(null);
        setUnlockError(error.message);
        return;
      }
      throw error;
    }
  }

  async function loadConfig(): Promise<void> {
    if (IS_READONLY) {
      return;
    }
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
      setNotice("Settings saved.", "success");
      await loadTasks();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Failed to save settings.", "error");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (needsUnlock) {
      return;
    }
    void loadConfig();
    void loadTasks({ announce: true });
  }, [needsUnlock, unlockKey]);

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
      setDraft(draftFromTask(selectedTask));
    }
  }, [selectedTask]);

  useEffect(() => {
    if (IS_READONLY) {
      return;
    }
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
        setNotice("Task saved.", "success");
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
        setNotice("Task created.", "success");
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Failed to save task.", "error");
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
      setNotice("Task deleted.", "success");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Failed to delete task.", "error");
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
      setNotice("Task order updated.", "success");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Failed to save order.", "error");
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
      setNotice(error instanceof Error ? error.message : `Failed to update ${field}.`, "error");
    }
  }

  async function copyPathToClipboard(path: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(path);
      setNotice(`Copied: ${path}`, "success");
    } catch {
      setNotice("Failed to copy path.", "error");
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

  if (needsUnlock) {
    return (
      <UnlockModal
        busy={false}
        errorMessage={unlockError}
        onUnlock={(key) => {
          setUnlockError(null);
          storeKey(key);
          setUnlockKey(key);
        }}
      />
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-left">
          <h1>Markdown Task Viewer</h1>
          <p className="eyebrow">{IS_READONLY ? "read-only" : "v0"}</p>
        </div>
        {!IS_READONLY ? (
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
        ) : null}
      </header>

      <main className="layout-grid">
        <TaskListPanel
          tasks={filteredTasks}
          selectedPath={selectedPath}
          errors={errors}
          hideDone={hideDone}
          onHideDoneChange={setHideDone}
          viewOnly={IS_READONLY}
          onSelectTask={(path) => {
            setSelectedPath(path);
            setActiveTab("detail");
            setExecutionResult(null);
            const target = tasks.find((t) => t.path === path);
            if (target) {
              setDraft(draftFromTask(target));
            }
          }}
          onCopyPath={(path) => void copyPathToClipboard(path)}
          onDragEnd={(event) => void handleDragEnd(event)}
        />

        <section className="panel editor-panel">
          <div className="panel-header">
            <h2>{IS_READONLY ? "Task Details" : draft?.originalPath ? "Edit Task" : "Task Details"}</h2>
            {!IS_READONLY && isDirty ? <span className="dirty-state">Unsaved changes</span> : null}
          </div>

          {!IS_READONLY && draft?.originalPath ? (
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

          {IS_READONLY ? (
            selectedTask ? (
              <TaskDetailView
                task={selectedTask}
                onCopyPath={(path) => void copyPathToClipboard(path)}
              />
            ) : (
              <div className="empty-editor">
                <p>Select a task to view it.</p>
              </div>
            )
          ) : draft && activeTab === "detail" ? (
            <TaskDetailForm
              draft={draft}
              setDraft={setDraft}
              selectedTask={selectedTask}
              taskDirs={taskDirs}
              pathManuallyEdited={pathManuallyEdited}
              setPathManuallyEdited={setPathManuallyEdited}
              busy={busy}
              notice={notice}
              onSave={() => void saveDraft()}
              onDelete={() => void deleteSelectedTask()}
              onCancel={() => setDraft(null)}
              onPatchField={(field, value) => void patchField(field, value)}
              onCopyPath={(path) => void copyPathToClipboard(path)}
            />
          ) : draft && activeTab === "execute" ? (
            <ExecuteTab
              draft={draft}
              selectedTask={selectedTask}
              globalCommands={globalCommands}
              executing={executing}
              executionResult={executionResult}
              notice={notice}
              onExecute={(commands) => void executeCommands(commands)}
              onCopyStdout={(stdout) => {
                void navigator.clipboard.writeText(stdout);
                setNotice("Copied to clipboard.", "success");
              }}
            />
          ) : !draft ? (
            <div className="empty-editor">
              <p>Select a task to edit it, or create a new one.</p>
            </div>
          ) : null}
        </section>
      </main>

      {!IS_READONLY && showSettings ? (
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
