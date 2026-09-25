---
date: 2026-09-06
tags:
  - tools
  - git
---

# Git — Hooks & Configuration

## Git Hooks Overview

Scripts that Git executes automatically at specific points in the workflow.

| Hook | Trigger | Common Use |
|------|---------|------------|
| `pre-commit` | Before commit is created | Lint, format, type-check staged files |
| `commit-msg` | After message is entered | Validate Conventional Commit format |
| `prepare-commit-msg` | Before editor opens | Prepend ticket ID to message |
| `pre-push` | Before push to remote | Run tests, check branch rules |
| `post-merge` | After merge completes | Install deps if lockfile changed |
| `post-checkout` | After branch switch | Run migrations, clear caches |

### Client-Side vs Server-Side

| Side | Hooks | Enforcement |
|------|-------|-------------|
| **Client** | pre-commit, commit-msg, pre-push | Can be bypassed with `--no-verify` |
| **Server** | pre-receive, update, post-receive | Cannot be bypassed — ultimate gate |

To run tests on `pre-push` with the pre-commit framework, see [Pre-Commit Hooks → Pre-Push Hooks](../../libs/code-quality/03-pre-commit-hooks.md#pre-push-hooks).

## Hook Setup with pre-commit

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v5.0.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-added-large-files

  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.9.0
    hooks:
      - id: ruff
        args: [--fix]
      - id: ruff-format

  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v1.14.0
    hooks:
      - id: mypy
```

```bash
pip install pre-commit                         # Or: uv tool install pre-commit
pre-commit install                             # Install hooks into .git/hooks/
pre-commit run --all-files                     # Run on entire repo
pre-commit autoupdate                          # Update hook versions
```

## Native Git Hooks (No Framework)

```bash
git config --local core.hooksPath .githooks    # Point to tracked directory (local repo scope)
```

```bash
#!/bin/sh
# .githooks/pre-commit
echo "Running pre-commit checks..."
ruff check . && ruff format --check .
```

```bash
chmod +x .githooks/pre-commit
```

## .gitignore

### Structure

```gitignore
# Dependencies
.venv/
__pycache__/

# Build output
dist/
build/
*.egg-info/

# Environment & secrets
.env
.env.*
!.env.example
secrets/

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Testing / coverage
coverage/
htmlcov/
.pytest_cache/
.mypy_cache/
.ruff_cache/

# Logs
*.log
logs/
```

### Patterns

| Pattern | Matches |
|---------|---------|
| `*.log` | All `.log` files everywhere |
| `/build` | Only `build/` in root |
| `build/` | Any `build/` at any depth |
| `!important.log` | Exclude from ignore (negate) |
| `doc/**/*.pdf` | PDFs in `doc/` tree |

### Global Gitignore

```bash
git config --global core.excludesFile ~/.gitignore_global
# Add OS/IDE patterns (.DS_Store, Thumbs.db, .vscode/, .idea/) there
```

## Git Aliases

```bash
git config --global alias.st "status -s"
git config --global alias.co "checkout"
git config --global alias.sw "switch"
git config --global alias.br "branch -v"
git config --global alias.lg "log --oneline --graph --all --decorate"
git config --global alias.last "log -1 --stat"
git config --global alias.unstage "reset HEAD --"
git config --global alias.amend "commit --amend --no-edit"
git config --global alias.wip "commit -am 'WIP'"
```

## Recommended Global Config

```bash
git config --global init.defaultBranch main
git config --global pull.rebase true           # Rebase on pull (linear history)
git config --global push.default current       # Push current branch by name
git config --global push.autoSetupRemote true  # Auto set upstream on first push
git config --global fetch.prune true           # Auto prune on fetch
git config --global rerere.enabled true        # Remember conflict resolutions
git config --global diff.algorithm histogram   # Better diff output
git config --global merge.conflictStyle zdiff3 # Show base in conflict markers
git config --global core.autocrlf input        # LF everywhere (Linux/Mac)
```

## Verify Configuration

```bash
git config --list --show-origin                # All settings with source file
git config --global --list                     # Global settings only
git config user.name                           # Single value
```
