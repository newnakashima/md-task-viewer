# md-task-viewer

A local task viewer/editor that treats Markdown files as tasks.

Each Markdown file (`1 file = 1 task`) is managed through a browser UI, and all changes are written back to local files.

## Features

- List Markdown tasks
- Create, edit, and delete tasks
- Frontmatter-based `MUST` / `WANT` priority and `TODO` / `WIP` / `DONE` status
- Drag-and-drop reordering
- Persistent ordering via a dedicated metadata file
- Auto-reload on external file changes

## Requirements

- Node.js `24.0.0` or later

## Quick Start

```bash
npx md-task-viewer [rootDir]
```

Examples:

```bash
npx md-task-viewer .
npx md-task-viewer ./tasks --port 4011 --no-open
```

If `rootDir` is omitted, the current directory is used.

## CLI Options

- `--port <number>`: Port to listen on
- `--host <host>`: Host to bind to (default: `127.0.0.1`)
- `--no-open`: Do not open the browser automatically

## Task Format

Each Markdown file should have frontmatter with the following keys:

```yaml
---
title: Release notes
priority: MUST
status: WIP
createdAt: 2026-03-15T08:00:00.000Z
updatedAt: 2026-03-15T09:30:00.000Z
---

# Notes

Free-form body text.
```

### Required frontmatter

- `title`
- `priority`: `MUST` or `WANT`
- `status`: `TODO`, `WIP`, or `DONE`
- `createdAt`: UTC ISO 8601
- `updatedAt`: UTC ISO 8601

Unknown frontmatter keys are preserved as-is.

Files missing required keys are displayed with default values and normalized on save.

Files with unparseable YAML frontmatter are excluded from the list and shown in the error panel.

## Ordering Metadata

Settings are stored in `.md-task-viewer.json` at the root directory:

```json
{
  "version": 1,
  "taskDirs": ["."],
  "order": [
    "alpha.md",
    "planning/release-notes.md"
  ]
}
```

- `taskDirs`: Directories to scan for `.md` files (relative to `rootDir`). Defaults to `["."]`.
- `order`: Task display order.

## File Discovery

Directories listed in `taskDirs` are scanned recursively. The following extensions are treated as tasks:

- `.md`
- `.markdown`

The following are excluded:

- `.git`
- `node_modules`
- `.md-task-viewer.json`

## Development

```bash
npm install
```

Build:

```bash
npm run build
```

Run locally:

```bash
npm run start:local
```

Unit / integration tests:

```bash
npm test
```

E2E tests:

```bash
npm run test:e2e
```

## Tech Stack

- Node.js + TypeScript
- Fastify
- React
- Vite
- `gray-matter`
- `chokidar`
- `@dnd-kit`
