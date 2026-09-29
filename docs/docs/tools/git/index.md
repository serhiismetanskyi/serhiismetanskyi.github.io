---
date: 2026-09-05
tags:
  - tools
  - git
---

# Git — Overview

## What Is Git

Git is a **distributed version control system** — every developer has a full copy of the repository, including its entire history.

```
Working Directory ──add──► Staging Area ──commit──► Local Repo ──push──► Remote
                                                        ▲
                                              pull / fetch + merge
```

| Concept | Description |
|---------|-------------|
| **Repository** | Project directory tracked by Git (contains `.git/`) |
| **Commit** | Immutable snapshot of all tracked files at a point in time |
| **Branch** | Lightweight movable pointer to a commit |
| **HEAD** | Pointer to the current branch / commit you are working on |
| **Remote** | Server-hosted copy of the repo (GitHub, GitLab, Bitbucket) |
| **Tag** | Named label pinned to a specific commit (releases) |

## Three-Area Model

| Area | Purpose | Command to move forward |
|------|---------|------------------------|
| **Working Directory** | Files you edit | `git add` → staging |
| **Staging Area (Index)** | Changes prepared for the next commit | `git commit` → repo |
| **Local Repository** | Full commit history | `git push` → remote |

```
edit file → git add → git commit → git push
                                      │
git pull ◄────────────────────────────┘
```

## Git Object Model

Git stores data as four object types:

| Object | Content |
|--------|---------|
| **blob** | File content (no filename) |
| **tree** | Directory listing — maps names to blobs/trees |
| **commit** | Snapshot pointer (tree) + parent(s) + author + message |
| **tag** | Annotated label pointing to a commit |

Each object is identified by a hash (**SHA-1** by default in most repos). Commits form a directed acyclic graph (DAG) through parent references.

## Distributed Model

```
Developer A ◄──► Remote (origin) ◄──► Developer B
     │                                      │
  full history                         full history
```

- Every clone is a full backup — no single point of failure
- Offline work: commit, branch, diff, log — all local
- Network needed only for `push`, `pull`, `fetch`

## When to Use Git (vs alternatives)

| Good Fit | Poor Fit |
|----------|----------|
| Source code | Large binary assets (use Git LFS) |
| Configuration files | Databases / data stores |
| Infrastructure-as-Code | Files > 100 MB per file |
| Documentation (Markdown) | Frequently auto-generated files |
| Dotfiles / settings | Secrets and credentials |

## Section Map

| File | Topics |
|------|--------|
| [01 — Commands & Fundamentals](./01-commands-fundamentals.md) | Init, add, commit, push, pull, log, diff, remote |
| [02 — Branching Strategies](./02-branching-strategies.md) | GitHub Flow, Gitflow, Trunk-Based, merge vs rebase |
| [03 — Commit Conventions](./03-commit-conventions.md) | Conventional Commits, message format, PR best practices |
| [04 — Advanced Workflows](./04-advanced-workflows.md) | Rebase, stash, cherry-pick, worktree, submodules |
| [05 — Hooks & Configuration](./05-hooks-configuration.md) | Pre-commit framework, native hooks, .gitignore, aliases, global config |
| [06 — Troubleshooting & Recovery](./06-troubleshooting-recovery.md) | Undo, reset, reflog, bisect, conflict resolution |

## QA Cheat Sheet Coverage

Command groups from the shared QA cheat sheet are covered across this section:

| Cheat Sheet Group | Where to find it |
|-------------------|------------------|
| Basics | [01 — Commands & Fundamentals](./01-commands-fundamentals.md#repository-setup), [Staging & Committing](./01-commands-fundamentals.md#staging-committing), [Remote Operations](./01-commands-fundamentals.md#remote-operations) |
| Branching | [01 — Branches](./01-commands-fundamentals.md#branches), [02 — Branching Strategies](./02-branching-strategies.md) |
| Syncing with remote | [01 — Remote Operations](./01-commands-fundamentals.md#remote-operations) |
| Undoing mistakes | [06 — Undo Cheat Sheet](./06-troubleshooting-recovery.md#undo-cheat-sheet), [Reset Modes](./06-troubleshooting-recovery.md#reset-modes), [Revert](./06-troubleshooting-recovery.md#revert-safe-undo-for-pushed-commits) |
| Stashing | [04 — Stash](./04-advanced-workflows.md#stash) |
| History and logs | [01 — Viewing History](./01-commands-fundamentals.md#viewing-history), [Diff & Blame](./01-commands-fundamentals.md#diff-blame) |
| PR workflow | [02 — GitHub Flow](./02-branching-strategies.md#github-flow-recommended-default), [Merge vs Rebase vs Squash](./02-branching-strategies.md#merge-vs-rebase-vs-squash), [03 — Pull Request Best Practices](./03-commit-conventions.md#pull-request-best-practices) |
| Merge conflicts | [06 — Conflict Resolution](./06-troubleshooting-recovery.md#conflict-resolution) |
| "Oh no" fixes | [06 — Reflog](./06-troubleshooting-recovery.md#reflog-your-safety-net), [Dangerous Commands Checklist](./06-troubleshooting-recovery.md#dangerous-commands-checklist), [Remove Committed Secrets](./06-troubleshooting-recovery.md#remove-committed-secrets-sensitive-files) |
| QA-specific tips | [03 — Commit Conventions](./03-commit-conventions.md), [05 — .gitignore](./05-hooks-configuration.md#gitignore), [01 — Tags](./01-commands-fundamentals.md#tags) |

## Cheat Sheet

### Basics ([01](./01-commands-fundamentals.md))

| Task | Command |
|------|---------|
| Init repo | `git init` |
| Stage all | `git add .` |
| Stage partial | `git add -p` |
| Commit | `git commit -m "msg"` |
| Push (set upstream) | `git push -u origin branch` |
| Pull with rebase | `git pull --rebase` |
| Fetch + prune stale | `git fetch --prune` |
| View graph | `git log --oneline --graph --all` |
| Show staged diff | `git diff --staged` |
| Delete remote branch | `git push origin --delete name` |

### Branching ([02](./02-branching-strategies.md))

| Task | Command |
|------|---------|
| Create + switch | `git switch -c name` |
| List branches | `git branch -a` |
| Merge into current | `git merge feature` |
| Rebase onto main | `git rebase main` |

### Advanced ([04](./04-advanced-workflows.md))

| Task | Command |
|------|---------|
| Interactive rebase | `git rebase -i HEAD~N` |
| Squash last N | `git rebase -i HEAD~N` → mark `squash` |
| Stash with message | `git stash push -m "msg"` |
| Pop stash | `git stash pop` |
| Cherry-pick | `git cherry-pick <hash>` |
| New worktree | `git worktree add <path> <branch>` |
| Fixup commit | `git commit --fixup <hash>` |

### Recovery ([06](./06-troubleshooting-recovery.md))

| Task | Command |
|------|---------|
| Undo last commit (keep changes) | `git reset --soft HEAD~1` |
| Discard all local changes | `git checkout -- .` |
| Find lost commits | `git reflog` |
| Binary search for bug | `git bisect start` / `good` / `bad` |
| Abort failed merge | `git merge --abort` |

---
## See also
- [Digital Garden: Knowledge Base](../../index.md)
- [CI/CD](../../ci-cd-approaches/index.md)
- [Test Automation Framework](../../test-automation-framework/index.md)
- [Code Quality & CI/CD](../../python-guide/05-quality-cicd/index.md)
- [uv — Fast Python Project Manager](../../libs/uv/index.md)
- [Tools — Practical Reference Guides](../index.md)
