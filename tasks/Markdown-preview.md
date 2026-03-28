---
title: Markdown preview
priority: MUST
status: DONE
createdAt: '2026-03-28T01:57:13.635Z'
updatedAt: '2026-03-28T07:57:29.952Z'
---
マークダウンテキストをプレビューできるようにする。

- 標準的なレンダリングを想定
  - コードブロックにシンタックスハイライトは要らない
  - mermaid などの特殊な記法に対応する必要もない
- `- [ ]` によるチェックボックスはプレビューできるようにする
- EXPAND 同様に EXPAND の右隣にボタンを設置する
- mac は cmd + e、その他の OS は ctrl + e でも切り替え可能
  - OSやブラウザのホットキーと衝突する場合は modifier を追加しても良い
