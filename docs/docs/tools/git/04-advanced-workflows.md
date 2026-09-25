---
date: 2026-09-06
tags:
  - tools
  - git
---

# Git — Advanced Workflows

## Interactive Rebase

Rewrite local commit history before pushing — squash, reorder, edit, drop.

```bash
git rebase -i HEAD~5                           # Rebase last 5 commits
git rebase -i main                             # Rebase onto main
```

Editor opens with a pick list:

```
pick abc1234 feat: add login page
pick def5678 fix: typo in login
pick ghi9012 feat: add logout button
pick jkl3456 fix: button alignment
pick mno7890 test: add login tests
```

| Command | Effect |
|---------|--------|
| `pick` | Keep commit as-is |
| `reword` | Keep commit, edit message |
| `squash` | Merge into previous commit, combine messages |
| `fixup` | Merge into previous commit, discard message |
| `edit` | Pause rebase to amend commit |
| `drop` | Remove commit entirely |

### Squash Workflow

```bash
git rebase -i HEAD~3
# Change 2nd and 3rd to "squash" or "fixup"
# Save → edit combined message → done
```

**Rule:** Only rebase commits that have **not been pushed** to a shared branch.

## Autosquash

Mark fixup commits at creation time — rebase auto-reorders them:

```bash
git commit --fixup abc1234                     # Creates "fixup! <original msg>"
git commit --squash abc1234                    # Creates "squash! <original msg>"

git rebase -i --autosquash main               # Fixups auto-placed after target
```

Enable globally:

```bash
git config --global rebase.autoSquash true
```

## Stash

Temporarily shelve changes without committing.

```bash
git stash                                      # Stash tracked changes
git stash push -m "AUTH-123: wip oauth flow"   # Stash with descriptive message
git stash -m "AUTH-123: wip oauth flow"         # Short form of stash push -m
git stash -u                                   # Include untracked files
git stash -a                                   # Include untracked + ignored

git stash list                                 # Show all stashes
git stash show stash@{0}                       # Summary of latest stash
git stash show -p stash@{0}                    # Full diff of stash

git stash pop                                  # Apply latest + remove from list
git stash apply stash@{2}                      # Apply specific stash (keep in list)
git stash drop stash@{0}                       # Delete specific stash
git stash clear                                # Delete all stashes
```

**Tip:** Always use `-m "message"` — unnamed stashes become unreadable in `git stash list`.

### Stash to Branch

```bash
git stash branch new-feature stash@{0}         # Create branch from stash + apply
```

## Cherry-Pick

Copy specific commits from another branch.

```bash
git cherry-pick abc1234                        # Apply single commit
git cherry-pick abc1234 def5678                # Multiple commits
git cherry-pick abc1234..ghi9012               # Range (exclusive..inclusive)
git cherry-pick -n abc1234                     # Apply without committing (stage only)
git cherry-pick -x abc1234                     # Append "(cherry picked from ...)" to msg
```

### Handling Conflicts

```bash
git cherry-pick abc1234
# CONFLICT → resolve files → then:
git add .
git cherry-pick --continue
# Or abort:
git cherry-pick --abort
```

**Use cases:** hotfix backport, pulling a single feature commit across branches.

## Worktree

Check out multiple branches simultaneously in separate directories — no stashing needed.

```bash
git worktree add ../hotfix hotfix/urgent       # Checkout branch in new dir
git worktree add -b feature/new ../new-feature # Create + checkout new branch
git worktree list                              # Show all worktrees
git worktree remove ../hotfix                  # Remove worktree
```

```
repo/           ← main (primary)
../hotfix/      ← hotfix/urgent (worktree)
../new-feature/ ← feature/new (worktree)
```

Each worktree has its own working directory and index, but shares the same `.git` object store.

## Submodules

Embed one Git repo inside another.

```bash
git submodule add https://github.com/org/lib.git libs/lib
git submodule update --init --recursive        # Clone submodules after clone
git submodule update --remote                  # Pull latest from submodule remote

git clone --recurse-submodules https://github.com/org/repo.git  # Clone with submodules
```

**Gotcha:** Submodules pin to a specific commit — you must explicitly update and commit the new reference.

**Alternative:** For simpler dependency management, consider `git subtree` or package managers.

## Rebase onto

Move a branch to a new base point.

```bash
git rebase --onto main feature/base feature/child
```

```
Before:
main ──●──●
        \
    base ──●──●
               \
            child ──●──●

After:
main ──●──●──●──●   (child commits replayed on main)
```

## Partial Operations

```bash
git add -p file.py                             # Stage specific hunks
git restore -p file.py                         # Discard specific hunks (modern)
git restore --staged -p file.py                # Unstage specific hunks (modern)
git stash push -p                              # Stash specific hunks
```

The `-p` (patch) flag opens an interactive prompt for each change hunk: `y` accept, `n` skip, `s` split, `q` quit.

> Classic equivalents (still work): `git checkout -p file.py` (discard), `git reset -p file.py` (unstage).
