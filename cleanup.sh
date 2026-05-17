# 作業が終わった worktree と ブランチを掃除するスクリプト
# 元のローカルリポジトリに戻ってから実行してください。
git checkout main
git pull

# worktree を使っている場合は下記のコメントアウトを外す。worktree の path は正しいものに置き換えること
# git worktree list --porcelain | awk '/^worktree /{print $2}' | grep -E '\.agents\/worktrees' | while IFS= read -r wt; do git worktree remove "$wt"; done

git for-each-ref --format='%(refname:short)' refs/heads | grep -vx 'main' | xargs -I {} git branch -d {}
git remote prune origin
