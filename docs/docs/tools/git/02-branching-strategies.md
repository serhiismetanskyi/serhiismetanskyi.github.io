---
date: 2026-09-05
tags:
  - tools
  - git
---

# Git — Branching Strategies

## GitHub Flow (Recommended Default)

Simplest model. One permanent branch (`main`), short-lived feature branches.

```
main ─────●────●────●────●────●────
           \       /      \       /
            ●──●──●        ●──●──●
           feature/A       feature/B
```

| Step | Action |
|------|--------|
| 1 | Create branch from `main` |
| 2 | Commit changes |
| 3 | Open Pull Request |
| 4 | Code review + CI passes |
| 5 | Merge to `main` |
| 6 | Deploy from `main` |

**Best for:** continuous deployment, small-to-medium teams, SaaS products.

## Gitflow

Structured model with multiple long-lived branches.

```
main ─────●──────────────────●──────────
           \                /
develop ────●──●──●──●──●──●──●──●──────
              \     /   \       /
               ●──●      ●──●──●
              feature    release/1.0
```

| Branch | Purpose | Merges into |
|--------|---------|-------------|
| `main` | Production-ready code | — |
| `develop` | Integration branch | `main` (via release) |
| `feature/*` | New functionality | `develop` |
| `release/*` | Stabilize for release | `main` + `develop` |
| `hotfix/*` | Urgent production fix | `main` + `develop` |

**Best for:** versioned software, mobile apps, enterprise releases.

## Trunk-Based Development

Everyone commits directly to `main` (or very short-lived branches, < 1 day).

```
main ──●──●──●──●──●──●──●──●──●──
        \  /                \  /
         ●                   ●
    (short-lived)       (short-lived)
```

| Requirement | Why |
|-------------|-----|
| Strong CI/CD pipeline | Every commit must pass all tests |
| Feature flags | Hide incomplete features in production |
| High test coverage | Breaking `main` blocks everyone |
| Frequent integration | Merge conflicts stay small |

**Best for:** mature teams with strong CI, Google/Meta-style engineering.

## Strategy Comparison

| Aspect | GitHub Flow | Gitflow | Trunk-Based |
|--------|------------|---------|-------------|
| Complexity | Low | High | Low |
| Branches | 1 permanent | 2+ permanent | 1 permanent |
| Release cadence | Continuous | Scheduled | Continuous |
| Feature flags needed | No | No | Yes |
| CI/CD maturity required | Medium | Low | High |
| Team size | Any | Medium-Large | Medium-Large |

## Merge vs Rebase vs Squash

### Merge (no fast-forward)

```bash
git merge --no-ff feature/auth
```

```
main ────●──────●──── (merge commit preserves branch history)
          \    /
           ●──●
          feature
```

- Preserves full branch history
- Creates a merge commit
- **Use for:** merging PRs into `main`

### Rebase

```bash
git switch feature/auth
git rebase main
# feature/auth now sits on top of latest main — commits have new hashes
```

```
Before:                        After git rebase main:
main ──●──●──●                 main ──●──●──●
        \                                     \
         ●──● (feature/auth)                   ●'──●' (feature/auth, replayed)
```

- Creates linear history (no merge commit)
- Rewrites commit hashes of the rebased branch — `feature/auth` stays as feature branch
- **Never rebase shared/public branches** (other developers have the old hashes)
- **Use for:** updating feature branch with latest `main` before opening a PR

### Squash Merge

```bash
git merge --squash feature/auth
git commit -m "feat: add user authentication"
```

- Combines all branch commits into one
- Clean single commit on `main`
- **Use for:** PRs with messy/WIP commit history

### Decision Guide

| Scenario | Strategy |
|----------|----------|
| Merging PR to `main` | Merge `--no-ff` or Squash |
| Updating feature with latest `main` | Rebase |
| Feature has clean, logical commits | Merge `--no-ff` |
| Feature has messy WIP commits | Squash merge |
| Shared branch (multiple developers) | Merge only |
| Solo feature branch | Rebase + merge |

## Branch Naming Convention

```
<type>/<ticket>-<short-description>

feature/AUTH-123-add-oauth
bugfix/API-456-fix-timeout
hotfix/PROD-789-null-pointer
chore/CI-101-update-ci-config
release/v2.1.0
```

| Prefix | Purpose |
|--------|---------|
| `feature/` | New functionality |
| `bugfix/` | Bug fix (non-urgent) |
| `hotfix/` | Urgent production fix |
| `chore/` | Maintenance, tooling, deps |
| `release/` | Release stabilization |
| `docs/` | Documentation only |
| `refactor/` | Code refactoring |

## Branch Protection Rules

Configure on GitHub/GitLab for `main`:

| Rule | Purpose |
|------|---------|
| Require PR reviews (≥ 1) | No direct pushes |
| Require status checks (CI) | Tests must pass |
| Require linear history | Force squash or rebase merges |
| Require signed commits | Verify commit authorship |
| Restrict force push | Prevent history rewrite |
| Auto-delete head branches | Clean up merged branches |
