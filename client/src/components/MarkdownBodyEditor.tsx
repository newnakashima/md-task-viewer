import { type ReactElement, useEffect, useMemo, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { marked } from "../markedSetup";
import { isMac, resolveAssetUrl } from "../utils";

// Rewrite relative <img src> values so the live preview resolves them against
// the markdown file's directory via the /api/assets route.
function rewriteImageSources(html: string, mdPath: string): string {
  if (typeof DOMParser === "undefined") {
    return html;
  }
  const doc = new DOMParser().parseFromString(html, "text/html");
  let changed = false;
  doc.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src");
    if (!src) {
      return;
    }
    const resolved = resolveAssetUrl(mdPath, src);
    if (resolved !== src) {
      img.setAttribute("src", resolved);
      changed = true;
    }
  });
  return changed ? doc.body.innerHTML : html;
}

export function MarkdownBodyEditor({
  value,
  onChange,
  bodyFullHeight,
  onToggleBodyFullHeight,
  selectedPath,
  mdPath,
  onUploadImage,
  onUploadError
}: {
  value: string;
  onChange: (next: string) => void;
  bodyFullHeight: boolean;
  onToggleBodyFullHeight: () => void;
  selectedPath: string | null;
  mdPath: string;
  onUploadImage: (file: File) => Promise<{ markdown: string }>;
  onUploadError: (message: string) => void;
}): ReactElement {
  const [showPreview, setShowPreview] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [dragActive, setDragActive] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const cursorPosRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });
  const restoreFocusRef = useRef<boolean>(false);
  const editorScrollRef = useRef<number>(0);
  const previewScrollRef = useRef<number>(0);
  const restoreEditorScrollRef = useRef<boolean>(false);
  const restorePreviewScrollRef = useRef<boolean>(false);

  const previewHtml = useMemo(
    () => DOMPurify.sanitize(rewriteImageSources(marked.parse(value || "") as string, mdPath)),
    [value, mdPath]
  );

  function insertAtCursor(text: string): void {
    const ta = textareaRef.current;
    if (!ta) {
      onChange(value ? `${value}\n${text}` : text);
      return;
    }
    const { selectionStart, selectionEnd } = ta;
    const next = value.slice(0, selectionStart) + text + value.slice(selectionEnd);
    onChange(next);
    const cursor = selectionStart + text.length;
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(cursor, cursor);
    });
  }

  async function uploadFiles(files: File[]): Promise<void> {
    const images = files.filter((file) => file.type.startsWith("image/"));
    if (images.length === 0 || uploading) {
      return;
    }
    setUploading(true);
    try {
      const snippets: string[] = [];
      for (const file of images) {
        const { markdown } = await onUploadImage(file);
        snippets.push(markdown);
      }
      insertAtCursor(`${snippets.join("\n")}\n`);
    } catch (error) {
      onUploadError(error instanceof Error ? error.message : "Failed to upload image.");
    } finally {
      setUploading(false);
    }
  }

  function togglePreview(): void {
    setShowPreview((prev) => {
      if (!prev && textareaRef.current) {
        cursorPosRef.current = {
          start: textareaRef.current.selectionStart,
          end: textareaRef.current.selectionEnd
        };
        editorScrollRef.current = textareaRef.current.scrollTop;
        restorePreviewScrollRef.current = true;
      }
      if (prev && previewRef.current) {
        previewScrollRef.current = previewRef.current.scrollTop;
        restoreFocusRef.current = true;
        restoreEditorScrollRef.current = true;
      }
      return !prev;
    });
  }

  // Reset editor view when switching tasks. `selectedPath` is a prop so this
  // also runs when the selected task changes while the editor stays mounted.
  useEffect(() => {
    setShowPreview(false);
    editorScrollRef.current = 0;
    previewScrollRef.current = 0;
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.scrollTop = 0;
      }
      if (previewRef.current) {
        previewRef.current.scrollTop = 0;
      }
    });
  }, [selectedPath]);

  useEffect(() => {
    function handleBodyFullHeightShortcut(e: KeyboardEvent): void {
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.shiftKey && e.key === "H") {
        e.preventDefault();
        onToggleBodyFullHeight();
      }
    }
    window.addEventListener("keydown", handleBodyFullHeightShortcut);
    return () => window.removeEventListener("keydown", handleBodyFullHeightShortcut);
  }, [onToggleBodyFullHeight]);

  useEffect(() => {
    function handlePreviewShortcut(e: KeyboardEvent): void {
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.key === "e") {
        e.preventDefault();
        togglePreview();
      }
    }
    window.addEventListener("keydown", handlePreviewShortcut);
    return () => window.removeEventListener("keydown", handlePreviewShortcut);
  }, []);

  return (
    <div className="editor-label">
      <span className="editor-label-header">
        <span>Markdown body</span>
        <button
          type="button"
          className="ghost-button body-fullheight-button"
          aria-pressed={bodyFullHeight}
          onClick={onToggleBodyFullHeight}
          title={`${isMac ? "Cmd" : "Ctrl"}+Shift+H`}
        >
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
            {bodyFullHeight ? (
              <path fillRule="evenodd" d="M3 12a1 1 0 011-1h2a1 1 0 011 1v2.586l3.293-3.293a1 1 0 011.414 1.414L8.414 16H10a1 1 0 110 2H4a1 1 0 01-1-1v-4h0zm14-1a1 1 0 00-1 1v2.586l-3.293-3.293a1 1 0 00-1.414 1.414L14.586 16H13a1 1 0 100 2h4a1 1 0 001-1v-4h0a1 1 0 00-1-1z" clipRule="evenodd" />
            ) : (
              <path fillRule="evenodd" d="M3 4a1 1 0 011-1h4a1 1 0 010 2H6.414l3.293 3.293a1 1 0 01-1.414 1.414L5 6.414V8a1 1 0 01-2 0V4zm9 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 11-2 0V6.414l-3.293 3.293a1 1 0 01-1.414-1.414L14.586 5H13a1 1 0 01-1-1zM3 12a1 1 0 011-1h2a1 1 0 011 1v2.586l3.293-3.293a1 1 0 011.414 1.414L8.414 16H10a1 1 0 110 2H4a1 1 0 01-1-1v-4h0zm14-1a1 1 0 00-1 1v2.586l-3.293-3.293a1 1 0 00-1.414 1.414L14.586 16H13a1 1 0 100 2h4a1 1 0 001-1v-4h0a1 1 0 00-1-1z" clipRule="evenodd" />
            )}
          </svg>
          {bodyFullHeight ? "Collapse" : "Expand"} ({isMac ? "⌘" : "Ctrl+"}⇧H)
        </button>
        <button
          type="button"
          className="ghost-button body-fullheight-button"
          aria-pressed={showPreview}
          onClick={togglePreview}
          title={`${isMac ? "Cmd" : "Ctrl"}+E`}
        >
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
            {showPreview ? (
              <path fillRule="evenodd" d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" clipRule="evenodd" />
            ) : (
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM4.332 8.027a6.012 6.012 0 011.912-2.706C6.512 5.73 6.974 6 7.5 6A1.5 1.5 0 019 7.5V8a2 2 0 004 0c0-1.1.9-2 2-2 .266 0 .52.052.752.147A5.984 5.984 0 0116 10c0 .38-.035.752-.103 1.114a4.003 4.003 0 01-2.59 2.588 1.994 1.994 0 01-1.307.263V14a1 1 0 11-2 0v-1.268a2 2 0 01.482-1.307A2.002 2.002 0 0112 9.616a3.98 3.98 0 01-.653-.298A3.98 3.98 0 019 10H8.5A2.5 2.5 0 006 12.5V13a1 1 0 11-2 0v-.5a4.5 4.5 0 012.634-4.1 5.996 5.996 0 01-.302-.873z" clipRule="evenodd" />
            )}
          </svg>
          {showPreview ? "Edit" : "Preview"} ({isMac ? "⌘" : "Ctrl+"}E)
        </button>
        {!showPreview ? (
          <>
            <button
              type="button"
              className="ghost-button body-fullheight-button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              title="Insert image"
            >
              <svg aria-hidden="true" width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
              </svg>
              {uploading ? "Uploading…" : "Image"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(event) => {
                const files = event.target.files ? Array.from(event.target.files) : [];
                event.target.value = "";
                void uploadFiles(files);
              }}
            />
          </>
        ) : null}
      </span>
      {showPreview ? (
        <div
          ref={(el) => {
            previewRef.current = el;
            if (el && restorePreviewScrollRef.current) {
              restorePreviewScrollRef.current = false;
              el.scrollTop = previewScrollRef.current;
            }
          }}
          className="markdown-preview"
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />
      ) : (
        <textarea
          aria-label="Markdown body"
          className={dragActive ? "drag-over" : undefined}
          onPaste={(event) => {
            const items = event.clipboardData?.items;
            if (!items) {
              return;
            }
            const files = Array.from(items)
              .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
              .map((item) => item.getAsFile())
              .filter((file): file is File => file !== null);
            if (files.length === 0) {
              return;
            }
            event.preventDefault();
            void uploadFiles(files);
          }}
          onDragEnter={(event) => {
            if (Array.from(event.dataTransfer?.types ?? []).includes("Files")) {
              setDragActive(true);
            }
          }}
          onDragOver={(event) => {
            if (Array.from(event.dataTransfer?.types ?? []).includes("Files")) {
              event.preventDefault();
            }
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(event) => {
            const files = event.dataTransfer?.files;
            if (!files || files.length === 0) {
              return;
            }
            const images = Array.from(files).filter((file) => file.type.startsWith("image/"));
            setDragActive(false);
            if (images.length === 0) {
              return;
            }
            event.preventDefault();
            void uploadFiles(images);
          }}
          ref={(el) => {
            textareaRef.current = el;
            if (el) {
              if (restoreFocusRef.current) {
                restoreFocusRef.current = false;
                const { start, end } = cursorPosRef.current;
                el.setSelectionRange(start, end);
                el.focus();
              }
              if (restoreEditorScrollRef.current) {
                restoreEditorScrollRef.current = false;
                el.scrollTop = editorScrollRef.current;
              }
            }
          }}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;

            const ta = event.currentTarget;
            const { selectionStart, selectionEnd, value: taValue } = ta;

            // Browsers don't auto-scroll a textarea when its value is mutated
            // programmatically (only on real keystrokes), so after list
            // continuation we manually keep the cursor line visible.
            function scrollCursorIntoView(): void {
              const styles = window.getComputedStyle(ta);
              const lineHeight =
                parseFloat(styles.lineHeight) || parseFloat(styles.fontSize) * 1.2;
              const paddingTop = parseFloat(styles.paddingTop) || 0;
              const paddingBottom = parseFloat(styles.paddingBottom) || 0;
              // 0-indexed line of the cursor, derived from newlines before it.
              const lineNumber = ta.value.slice(0, ta.selectionEnd).split("\n").length - 1;
              const cursorBottom = paddingTop + (lineNumber + 1) * lineHeight;
              const visibleBottom = ta.scrollTop + ta.clientHeight;
              if (cursorBottom > visibleBottom - paddingBottom) {
                // Cursor is below the visible area: scroll down so its line
                // sits just above the bottom padding.
                ta.scrollTop = cursorBottom - ta.clientHeight + paddingBottom;
              } else {
                const cursorTop = paddingTop + lineNumber * lineHeight;
                if (cursorTop < ta.scrollTop) {
                  // Cursor is above the visible area: scroll up to it.
                  ta.scrollTop = cursorTop;
                }
              }
            }

            if (event.key === "Tab") {
              event.preventDefault();
              const lineStart = taValue.lastIndexOf("\n", selectionStart - 1) + 1;
              const lineEnd = taValue.indexOf("\n", selectionEnd);
              const end = lineEnd === -1 ? taValue.length : lineEnd;

              if (selectionStart !== selectionEnd) {
                // Multi-line indent/dedent
                const selectedLines = taValue.slice(lineStart, end);
                const newLines = selectedLines
                  .split("\n")
                  .map((line) =>
                    event.shiftKey
                      ? line.startsWith("  ") ? line.slice(2) : line
                      : "  " + line
                  )
                  .join("\n");
                const newValue = taValue.slice(0, lineStart) + newLines + taValue.slice(end);
                onChange(newValue);
                requestAnimationFrame(() => {
                  ta.selectionStart = lineStart;
                  ta.selectionEnd = lineStart + newLines.length;
                });
              } else if (event.shiftKey) {
                // Shift+Tab: remove 2 spaces from line start
                const line = taValue.slice(lineStart, end);
                if (line.startsWith("  ")) {
                  const newValue = taValue.slice(0, lineStart) + line.slice(2) + taValue.slice(end);
                  const newCursor = Math.max(lineStart, selectionStart - 2);
                  onChange(newValue);
                  requestAnimationFrame(() => {
                    ta.selectionStart = ta.selectionEnd = newCursor;
                  });
                }
              } else {
                // Tab: insert 2 spaces at line start
                const newValue = taValue.slice(0, lineStart) + "  " + taValue.slice(lineStart);
                onChange(newValue);
                requestAnimationFrame(() => {
                  ta.selectionStart = ta.selectionEnd = selectionStart + 2;
                });
              }
              return;
            }

            if (event.key === "Enter") {
              const lineStart = taValue.lastIndexOf("\n", selectionStart - 1) + 1;
              const currentLine = taValue.slice(lineStart, selectionStart);
              const listMatch = currentLine.match(/^(\s*)([-*]|\d+\.)\s/);

              if (listMatch) {
                event.preventDefault();
                const [fullMatch, indent, marker] = listMatch;
                const textAfterMarker = currentLine.slice(fullMatch.length);

                if (textAfterMarker.trim() === "") {
                  // Empty list item — remove the marker, leave blank line
                  const newValue = taValue.slice(0, lineStart) + taValue.slice(selectionStart);
                  onChange(newValue);
                  requestAnimationFrame(() => {
                    ta.selectionStart = ta.selectionEnd = lineStart;
                    scrollCursorIntoView();
                  });
                } else {
                  // Continue the list
                  const nextMarker = /^\d+\./.test(marker)
                    ? `${parseInt(marker) + 1}.`
                    : marker;
                  const insertion = `\n${indent}${nextMarker} `;
                  const newValue = taValue.slice(0, selectionStart) + insertion + taValue.slice(selectionEnd);
                  const newCursor = selectionStart + insertion.length;
                  onChange(newValue);
                  requestAnimationFrame(() => {
                    ta.selectionStart = ta.selectionEnd = newCursor;
                    scrollCursorIntoView();
                  });
                }
              }
            }
          }}
          placeholder="# Notes"
        />
      )}
    </div>
  );
}
