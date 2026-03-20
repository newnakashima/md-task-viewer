# AGENTS.md

This file provides guidance to AI coding agents when working with code in this repository.

## Project Overview

md-task-viewer is a local task management tool where each markdown file (with YAML frontmatter) represents a single task. It provides a browser-based UI for viewing, editing, filtering, and reordering tasks while persisting all changes to the local filesystem.

## Commands

```bash
npm run build              # Build both server and client
npm run build:server       # Build server only (tsup)
npm run build:client       # Build client only (Vite)
npm run dev:client         # Vite dev server with hot reload
npm run start:local        # Build + run locally
npm test                   # Run unit tests (Vitest)
npm run test:e2e           # Run E2E tests (Playwright)
```

To run a single test file: `npx vitest run tests/taskStore.test.ts`

E2E tests expect the app at `http://127.0.0.1:4173` (Vite preview server).

## Architecture

**Backend** (Fastify + TypeScript, built with tsup):
- `src/cli.ts` — CLI entry point, parses args, spawns server
- `src/server.ts` — Fastify HTTP server, REST API routes, SSE event stream
- `src/taskStore.ts` — Core business logic: CRUD operations, markdown/frontmatter parsing (gray-matter), file watching (chokidar), config management
- `src/types.ts` — Shared TypeScript interfaces (TaskRecord, Config, etc.)

**Frontend** (React 19, built with Vite):
- `client/src/App.tsx` — Single large component: task list with drag-and-drop (@dnd-kit), task editor, settings modal, SSE-based live reload
- `client/src/styles.css` — All styling

**Data flow**: CLI starts Fastify → watches task directories with chokidar → serves React app via @fastify/static → client communicates via REST API + EventSource (SSE) for live updates.

## Task Format

Each `.md`/`.markdown` file is a task with required YAML frontmatter:

```yaml
---
title: string
priority: MUST | WANT
status: TODO | WIP | DONE
createdAt: ISO 8601 UTC
updatedAt: ISO 8601 UTC
---
```

Configuration and ordering are stored in `.md-task-viewer.json` (version, taskDirs, ignorePaths, order).

## Key API Routes

- `GET/POST /api/tasks`, `PATCH/DELETE /api/tasks/*` — Task CRUD
- `PATCH /api/task-fields/*` — Quick priority/status update
- `PUT /api/order` — Save task display order
- `GET/PUT /api/config` — Settings (taskDirs, ignorePaths)
- `GET /api/events` — SSE stream for live file change notifications

## Technical Notes

- ESM-only (`"type": "module"` in package.json)
- TypeScript strict mode
- Node.js ≥18.18.0 required
- Custom error classes: `ValidationError`, `ConflictError` (in taskStore.ts)
- Conflict detection uses `baseUpdatedAt` to prevent overwriting concurrent edits
