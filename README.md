# md-task-viewer

ローカルディレクトリ内の Markdown ファイル群をタスクとして一覧・編集できるツールです。

`1 Markdown file = 1 task` として扱い、ブラウザ上の操作をローカルファイルへそのまま反映します。

## Features

- Markdown タスクの一覧表示
- タスクの作成・編集・削除
- frontmatter ベースの `MUST` / `WANT` と `TODO` / `WIP` / `DONE` 管理
- ドラッグアンドドロップによる並び替え
- 並び順専用メタデータファイルで順序を固定
- 起動中の外部ファイル編集を自動反映

## Requirements

- Node.js `18.18.0` 以上

## Install

```bash
npm install
```

## Local Usage

ビルドしてローカルサーバーを起動します。

```bash
npm run start:local
```

ブラウザ自動起動を止めたい場合:

```bash
npm run start:local -- --no-open
```

ポートを変更したい場合:

```bash
npm run start:local -- --port 4011
```

ビルド済みであれば次でも起動できます。

```bash
npm start
```

## Planned npx Usage

公開後は次の形を想定しています。

```bash
npx md-task-viewer [rootDir]
```

例:

```bash
npx md-task-viewer .
npx md-task-viewer ./tasks --port 4011 --no-open
```

## CLI Options

- `--port <number>`: 使用ポート
- `--host <host>`: bind するホスト。既定値は `127.0.0.1`
- `--no-open`: ブラウザを自動起動しない

`rootDir` を省略した場合はカレントディレクトリを対象にします。

## Task Format

各 Markdown ファイルは frontmatter に以下のキーを持ちます。

```yaml
---
title: Release notes
priority: MUST
status: WIP
createdAt: 2026-03-15T08:00:00.000Z
updatedAt: 2026-03-15T09:30:00.000Z
---

# Notes

本文は自由です。
```

### Required frontmatter

- `title`
- `priority`: `MUST` or `WANT`
- `status`: `TODO`, `WIP`, `DONE`
- `createdAt`: UTC ISO 8601
- `updatedAt`: UTC ISO 8601

既知キー以外の frontmatter は保持されます。

frontmatter の必須キーが欠けているファイルは、読み込み時に既定値で補完して表示し、保存時に正規化します。

YAML frontmatter を解析できない Markdown は一覧に出さず、UI のエラーパネルに表示します。

## Ordering Metadata

設定は対象ディレクトリ直下の `.md-task-viewer.json` に保存されます。

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

- `taskDirs`: タスクとして扱う `.md` ファイルを検索するディレクトリのリスト（`rootDir` からの相対パス）。デフォルトは `["."]`（ルート配下すべて）。
- `order`: タスクの並び順。

## File Discovery

`taskDirs` に指定されたディレクトリ配下を再帰的に走査し、以下の拡張子のファイルをタスクとして扱います。

- `.md`
- `.markdown`

以下は除外されます。

- `.git`
- `node_modules`
- `.md-task-viewer.json`

## Development

ビルド:

```bash
npm run build
```

ユニット・統合テスト:

```bash
npm test
```

E2E テスト:

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

## Current Status

- package version は `0.1.0`
- ローカル利用前提
- npm 未公開のため、現時点では `npm run start:local` での起動が基本です
