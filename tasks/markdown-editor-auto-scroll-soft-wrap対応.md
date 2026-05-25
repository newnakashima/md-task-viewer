---
title: markdown-editor-auto-scroll soft wrap対応
priority: WANT
status: TODO
createdAt: '2026-05-25T13:00:00.000Z'
updatedAt: '2026-05-25T13:00:00.000Z'
---
`MarkdownBodyEditor.tsx` の `scrollCursorIntoView()` はカーソル行を `\n` の数だけで算出している。textarea はソフトラップ有効なため、長い行が視覚的に折り返されていると算出した行番号が実際の表示行と一致せず、リスト継続後にカーソルが可視領域に入らないケースがある。

参考: https://github.com/newnakashima/md-task-viewer/pull/39#discussion_r3298224321 (Copilot レビュー)

## 対応案

- ミラー要素方式（textarea-caret-position 相当）で caret の Y 座標を計測してスクロールする
- または scrollHeight ベースのより確実なスクロール方法に変更する

## 影響範囲

`client/src/components/MarkdownBodyEditor.tsx` の `scrollCursorIntoView()`。
