import { type ReactElement } from "react";
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
  sortableKeyboardCoordinates,
  verticalListSortingStrategy
} from "@dnd-kit/sortable";
import type { TaskError, TaskRecord } from "../types";
import { SortableTaskItem } from "./SortableTaskItem";

export function TaskListPanel({
  tasks,
  selectedPath,
  errors,
  hideDone,
  onHideDoneChange,
  onSelectTask,
  onCopyPath,
  onDragEnd
}: {
  tasks: TaskRecord[];
  selectedPath: string | null;
  errors: TaskError[];
  hideDone: boolean;
  onHideDoneChange: (next: boolean) => void;
  onSelectTask: (path: string) => void;
  onCopyPath: (path: string) => void;
  onDragEnd: (event: DragEndEvent) => void;
}): ReactElement {
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

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Tasks</h2>
        <span className="panel-header-right">
          <label className="filter-toggle">
            <input type="checkbox" checked={hideDone} onChange={() => onHideDoneChange(!hideDone)} />
            <span>Hide DONE</span>
          </label>
          <span>{tasks.length} items</span>
        </span>
      </div>

      <div className="sidebar-scroll">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={tasks.map((task) => task.path)} strategy={verticalListSortingStrategy}>
            <div className="task-list">
              {tasks.map((task) => (
                <SortableTaskItem
                  key={task.path}
                  task={task}
                  selected={task.path === selectedPath}
                  onSelect={onSelectTask}
                  onCopyPath={onCopyPath}
                />
              ))}
              {tasks.length === 0 ? <p className="empty-list">{hideDone ? "No active tasks." : "No tasks yet. Create your first markdown task."}</p> : null}
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
  );
}
