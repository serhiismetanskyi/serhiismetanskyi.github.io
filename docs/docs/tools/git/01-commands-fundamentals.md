---
date: 2026-09-05
tags:
  - tools
  - git
---

# Git — Commands & Fundamentals

## Repository Setup

```bash
git init                                       # Initialize new repo in current dir
git init myproject                             # Create dir + initialize
git clone https://github.com/org/repo.git      # Clone remote repo
git clone --depth 1 https://github.com/org/repo.git  # Shallow clone (latest only)
git clone --branch v2.0 https://github.com/org/repo.git  # Clone specific tag/branch
```

## Staging & Committing

```bash
git status                                     # Working tree status
git status -s                                  # Short format

git add file.py                                # Stage specific file
git add src/                                   # Stage directory
git add .                                      # Stage all changes
git add -p                                     # Stage interactively (hunk by hunk)

git commit -m "feat: add user auth"            # Commit with message
git commit                                     # Open editor for message
git commit -am "fix: typo"                     # Stage tracked + commit (skip add)
git commit --amend                             # Modify last commit (message + files)
git commit --amend --no-edit                   # Add staged files to last commit silently
```

## Viewing History

```bash
git log                                        # Full log
git log --oneline                              # One line per commit
git log --oneline --graph --all                # Visual branch graph
git log --graph --oneline                      # Graph for current branch context
git log --since="2 weeks ago"                  # Time-based filter
git log --author="Name"                        # Author filter
git log -5                                     # Last 5 commits
git log -n 10                                  # Last 10 commits
git log -- path/to/file                        # History of specific file
git log -p -- path/to/file                     # History with diffs

git show abc1234                               # Show specific commit details
git show HEAD~3                                # 3 commits before HEAD
```

## Diff & Blame

```bash
git diff                                       # Unstaged changes
git diff --staged                              # Staged changes (ready to commit)
git diff HEAD                                  # All changes vs last commit
git diff main..feature                         # Difference between branches
git diff --stat main..feature                  # Summary (files changed, lines ±)
git diff --name-only main..feature             # Only filenames

git blame file.py                              # Who changed each line
git blame -L 10,20 file.py                     # Blame specific line range
```

## Branches

```bash
git branch                                     # List local branches
git branch -a                                  # List all (local + remote)
git branch -v                                  # Branches with last commit
git branch feature/auth                        # Create branch
git branch -d feature/auth                     # Delete merged branch
git branch -D feature/auth                     # Force delete unmerged branch
git branch -m old-name new-name                # Rename branch

git switch feature/auth                        # Switch to branch (modern)
git switch -c feature/auth                     # Create + switch (modern)
git switch -                                   # Switch to previous branch
git checkout feature/auth                      # Switch (classic)
git checkout -b feature/auth                   # Create + switch (classic)
```

## Remote Operations

```bash
git remote -v                                  # List remotes with URLs
git remote add origin https://github.com/org/repo.git
git remote set-url origin git@github.com:org/repo.git

git fetch origin                               # Download changes (no merge)
git fetch --all                                # Fetch from all remotes
git fetch --prune                              # Fetch + remove stale remote branches

git pull                                       # Fetch + merge current branch
git pull --rebase                              # Fetch + rebase (linear history)
git pull origin main                           # Pull specific branch
git pull --rebase origin main                  # Rebase current branch onto latest origin/main

git push origin feature/auth                   # Push branch to remote
git push -u origin feature/auth                # Push + set upstream tracking
git push                                       # Push current branch (if upstream set)
git push --force-with-lease origin feature/auth # Safer force-push after local history rewrite
git push --tags                                # Push all tags
git push origin --delete feature/auth          # Delete remote branch
```

## Tags

```bash
git tag                                        # List tags
git tag v1.0.0                                 # Lightweight tag
git tag -a v1.0.0 -m "Release 1.0.0"          # Annotated tag (recommended)
git tag -a v1.0.0 abc1234 -m "Release 1.0.0"   # Tag specific commit (message required)

git push origin v1.0.0                         # Push single tag
git push origin --tags                         # Push all tags
git tag -d v1.0.0                              # Delete local tag
git push origin --delete refs/tags/v1.0.0      # Delete remote tag (unambiguous)
```

## Cleanup

```bash
git clean -n                                   # Dry run — show what would be removed
git clean -fd                                  # Remove untracked files + directories
git clean -fdx                                 # Also remove ignored files

git gc                                         # Garbage collect + prune unreachable objects
# git prune is called automatically by git gc — don't run it standalone on shared repos
```
