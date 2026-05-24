import { type ReactElement } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { TaskRecord } from "../types";
import { formatDate } from "../utils";
import { CopyPathButton } from "./CopyPathButton";

export function SortableTaskItem({
  task,
  selected,
  onSelect,
  onCopyPath,
  viewOnly = false
}: {
  task: TaskRecord;
  selected: boolean;
  onSelect: (path: string) => void;
  onCopyPath: (path: string) => void;
  viewOnly?: boolean;
}): ReactElement {
  if (viewOnly) {
    return (
      <div
        className={`task-row${selected ? " task-row-selected" : ""}`}
        role="button"
        tabIndex={0}
        onClick={() => onSelect(task.path)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect(task.path);
          }
        }}
      >
        <span className="task-row-badges">
          <span className={`badge badge-${task.frontmatter.priority.toLowerCase()}`}>{task.frontmatter.priority}</span>
          <span className={`badge badge-${task.frontmatter.status.toLowerCase()}`}>{task.frontmatter.status}</span>
          <CopyPathButton path={task.path} onCopy={onCopyPath} className="task-row-copy" />
        </span>
        <strong>{task.frontmatter.title}</strong>
        <small>{task.path}</small>
        <small>Updated {formatDate(task.frontmatter.updatedAt)}</small>
      </div>
    );
  }

  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: task.path });
  const { onKeyDown: sortableOnKeyDown, ...sortableListeners } = listeners ?? {};
  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`task-row${selected ? " task-row-selected" : ""}`}
      onClick={() => onSelect(task.path)}
      onKeyDown={(event) => {
        sortableOnKeyDown?.(event);
        if (!event.defaultPrevented && event.key === "Enter") {
          event.preventDefault();
          onSelect(task.path);
        }
      }}
      {...attributes}
      {...sortableListeners}
    >
      <span className="task-row-badges">
        <span className={`badge badge-${task.frontmatter.priority.toLowerCase()}`}>{task.frontmatter.priority}</span>
        <span className={`badge badge-${task.frontmatter.status.toLowerCase()}`}>{task.frontmatter.status}</span>
        <CopyPathButton path={task.path} onCopy={onCopyPath} className="task-row-copy" />
      </span>
      <strong>{task.frontmatter.title}</strong>
      <small>{task.path}</small>
      <small>Updated {formatDate(task.frontmatter.updatedAt)}</small>
    </div>
  );
}
