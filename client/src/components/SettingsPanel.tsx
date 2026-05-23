import { type ReactElement, useState } from "react";
import type { CommandStep } from "../types";
import { RemoveButton } from "./RemoveButton";
import { CommandStepEditor } from "./CommandStepEditor";

export function SettingsPanel({
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
