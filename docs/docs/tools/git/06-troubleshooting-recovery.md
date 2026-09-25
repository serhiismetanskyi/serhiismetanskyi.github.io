---
date: 2026-09-06
tags:
  - tools
  - git
---

# Git — Troubleshooting & Recovery

## Undo Cheat Sheet

| What happened | Fix command | Safe? |
|--------------|-------------|-------|
| Unstage a file | `git restore --staged file.py` (modern) / `git reset HEAD file.py` | Yes |
| Discard changes in file | `git restore file.py` (modern) / `git checkout -- file.py` | Destructive |
| Undo last commit (keep changes) | `git reset --soft HEAD~1` | Yes |
| Undo last commit (unstage changes) | `git reset HEAD~1` | Yes |
| Undo last commit (discard changes) | `git reset --hard HEAD~1` | Destructive |
| Revert pushed commit | `git revert abc1234` | Yes (creates new commit) |
| Undo a merge | `git revert -m 1 <merge-hash>` | Yes |
| Fix last commit message | `git commit --amend` | Safe if not pushed |
| Fix last commit message inline | `git commit --amend -m "new message"` | Safe if not pushed |
| Add file to last commit | `git add file && git commit --amend --no-edit` | Safe if not pushed |

## Reset Modes

```bash
git reset --soft HEAD~1                        # Move HEAD, keep staging + working
git reset HEAD~1                               # Move HEAD, keep working (default: mixed)
git reset --hard HEAD~1                        # Move HEAD, discard everything
```

| Mode | HEAD | Staging | Working Dir |
|------|------|---------|-------------|
| `--soft` | Moves back | Unchanged | Unchanged |
| `--mixed` | Moves back | Reset | Unchanged |
| `--hard` | Moves back | Reset | Reset |

**Rule:** Never `reset --hard` on commits that have been pushed to shared branches.

## Reflog — Your Safety Net

Git records every HEAD movement. Default retention is typically:
- reachable reflog entries: ~90 days
- unreachable reflog entries: ~30 days

```bash
git reflog                                     # Show HEAD movement history
git reflog show feature/auth                   # Reflog for specific branch

# Output example:
# abc1234 HEAD@{0}: reset: moving to HEAD~1
# def5678 HEAD@{1}: commit: feat: add oauth
# ghi9012 HEAD@{2}: checkout: moving from main to feature/auth
```

### Recovery Scenarios

```bash
# Undo accidental reset --hard
git reflog
git reset --hard HEAD@{1}                      # Restore to previous state

# Recover deleted branch
git reflog
git branch recovered-branch abc1234            # Recreate from found hash
git checkout -b recovered-branch abc1234       # Recreate + switch immediately

# Undo bad rebase
git reflog
git reset --hard HEAD@{N}                      # N = entry before rebase started
```

## Revert (Safe Undo for Pushed Commits)

```bash
git revert abc1234                             # Create inverse commit
git revert abc1234 --no-commit                 # Stage revert without committing
git revert HEAD~3..HEAD                        # Revert last 3 commits
git revert -m 1 <merge-commit>                 # Revert a merge (keep parent 1)
```

`revert` is safe for public branches — it adds a new commit instead of rewriting history.

## Conflict Resolution

```bash
git merge feature/auth                         # Conflict occurs
git status                                     # See conflicted files
```

Conflict markers in file:

```
<<<<<<< HEAD
current branch code
=======
incoming branch code
>>>>>>> feature/auth
```

With `zdiff3` conflict style (recommended — shows common ancestor):

```
<<<<<<< HEAD
current branch code
||||||| common ancestor
original code before both changes
=======
incoming branch code
>>>>>>> feature/auth
```

```bash
# After resolving conflicts manually:
git add resolved-file.py
git merge --continue                           # Or: git commit

# Resolve by taking one side completely (per file):
git checkout --ours path/to/file               # Keep your version
git checkout --theirs path/to/file             # Keep incoming version
git add path/to/file

# Abort if needed:
git merge --abort
git rebase --abort
git cherry-pick --abort
```

### Tools for Conflict Resolution

```bash
git mergetool                                  # Open configured merge tool
git config --global merge.tool vimdiff         # Set default merge tool
```

## Bisect — Find the Bug Commit

Binary search through history to find which commit introduced a bug.

```bash
git bisect start
git bisect bad                                 # Current commit is broken
git bisect good v1.0.0                         # This tag/commit was working

# Git checks out a middle commit → test it → mark:
git bisect good                                # This commit is fine
git bisect bad                                 # This commit has the bug
# Repeat until Git finds the culprit

git bisect reset                               # Return to original branch
```

### Automated Bisect

```bash
git bisect start HEAD v1.0.0
git bisect run pytest tests/test_auth.py       # Auto-run command each step
```

Git marks commits as good/bad based on the exit code (0 = good, non-zero = bad).

## Recover Staged-but-Not-Committed Changes

After `git reset --hard`, blobs that were staged (added with `git add`) survive as dangling objects in Git's object store — Git never ran garbage collection on them yet.

```bash
git fsck --lost-found                          # Find all dangling objects
ls .git/lost-found/other/                      # Blobs (file contents without names)
cat .git/lost-found/other/<hash>               # Inspect each blob
```

> This recovers **file content only** (blob objects) — filenames are lost. You identify the right blob by reading its contents.

**Never staged or committed:** Completely unrecoverable — Git never tracked them.

## Remove Committed Secrets / Sensitive Files

If a secret was committed, rotate it immediately and rewrite history with modern tooling.

```bash
pip install git-filter-repo                    # Or: uv tool install git-filter-repo
git filter-repo --path .env --invert-paths     # Remove a file from all history
git push --force-with-lease origin main        # Coordinate with team before pushing
```

`git filter-branch` (seen in older guides) is legacy and much slower; prefer `git filter-repo` or BFG Repo-Cleaner.

## Dangerous Commands Checklist

| Command | Risk | Safer Alternative |
|---------|------|-------------------|
| `git reset --hard` | Destroys working dir changes | `git reset --soft` or `git stash` |
| `git push --force` | Overwrites remote history | `git push --force-with-lease` |
| `git clean -fd` | Deletes untracked files | `git clean -n` (dry run first) |
| `git rebase` on shared branch | Rewrites shared history | `git merge` |
| `git checkout -- .` | Discards all unstaged changes | `git stash` |

`--force-with-lease` is safer than `--force`: it refuses to push if someone else pushed to the branch since your last fetch.

## Troubleshooting Decision Tree

```
Lost commits?
├── git reflog → find hash → git reset/branch
├── git fsck --lost-found → dangling objects
└── Not committed? → Unrecoverable

Merge conflict?
├── git status → see conflicted files
├── Edit files → remove markers
├── git add → git merge --continue
└── Too messy? → git merge --abort

Wrong branch?
├── Not committed? → git stash → switch → pop
├── Committed? → git cherry-pick on correct branch
└── git reset HEAD~1 on wrong branch

Bad commit pushed?
├── git revert <hash> (safe, adds inverse commit)
└── Never rewrite public history with reset/rebase
```
