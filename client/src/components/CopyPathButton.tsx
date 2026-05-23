import { type ReactElement } from "react";

export function CopyPathButton({
  path,
  onCopy,
  className,
  label
}: {
  path: string;
  onCopy: (path: string) => void;
  className?: string;
  label?: string;
}): ReactElement {
  return (
    <button
      type="button"
      className={`ghost-button copy-path-button${className ? ` ${className}` : ""}`}
      title={`Copy ${path}`}
      aria-label={`Copy path ${path}`}
      onClick={(event) => {
        event.stopPropagation();
        onCopy(path);
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M7 3a2 2 0 00-2 2v8a2 2 0 002 2h6a2 2 0 002-2V5a2 2 0 00-2-2H7z" />
        <path d="M3 7a2 2 0 012-2v8a4 4 0 004 4h6a2 2 0 01-2 2H7a4 4 0 01-4-4V7z" />
      </svg>
      {label}
    </button>
  );
}
