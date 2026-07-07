---
title: read-only モードで画像を表示できるようにする
priority: SHOULD
status: TODO
createdAt: '2026-05-30T10:00:00.000Z'
updatedAt: '2026-05-30T10:00:00.000Z'
---
`add-image.md`（本文への画像挿入）のライブ編集対応に続く後続タスク。

read-only（静的バンドル）モードでは API サーバが居ないため `/api/assets/*` 配信が使えず、本文の相対画像リンクがそのままでは解決できない。静的バンドルでも画像を表示できるようにする。

## やること

- `build-readonly`（`scripts/build-readonly.ts` / `src/readonly/snapshot.ts` / `src/commands/buildReadonly.ts`）で、各タスク本文中の相対画像リンクを走査し、参照先の画像ファイルをバンドル出力（例: `data/assets/...`）へコピーする
- `TaskDetailView`（read-only 用ビュー）でも、ライブ編集側と同じく相対 `<img src>` をバンドル内の相対パス（例: `./data/assets/...`）へ書き換える
- **暗号化スナップショット版**は平文の画像ファイルをバンドルに置くと暗号化の意味が薄れるため、画像を base64 data URI としてスナップショット JSON 内にインライン化する方針を検討する
  - 非暗号化版はファイルコピー、暗号化版は data URI インライン化、と分岐する想定
- スナップショットが肥大化しすぎないようサイズ方針（上限・警告）も検討

## 前提

- ライブ編集側の保存先・リンク形式（md と同階層の `assets/`、相対リンク `![](assets/xxx.png)`）に合わせること
