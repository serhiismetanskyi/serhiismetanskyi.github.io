---
date: 2026-09-05
tags:
  - tools
  - git
---

# Git — Commit Conventions & PR Practices

## Conventional Commits

Standard format adopted by most open-source projects and enforced by tools like `commitlint`:

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Type Prefix

| Type | Meaning | SemVer impact |
|------|---------|---------------|
| `feat` | New feature | MINOR |
| `fix` | Bug fix | PATCH |
| `docs` | Documentation only | — |
| `style` | Formatting, whitespace | — |
| `refactor` | Code change (no new feature, no fix) | — |
| `perf` | Performance improvement | PATCH |
| `test` | Add or fix tests | — |
| `build` | Build system, dependencies | — |
| `ci` | CI/CD configuration | — |
| `chore` | Maintenance, tooling | — |
| `revert` | Revert a previous commit | — |

**Breaking change:** Add `!` after type or `BREAKING CHANGE:` in footer:

```
feat(api)!: remove deprecated /v1 endpoints

BREAKING CHANGE: /v1/* endpoints removed. Migrate to /v2/*.
```

### Examples

```
feat(auth): add OAuth2 login with Google
fix(api): handle null response from payment gateway
docs(readme): add deployment instructions
refactor(db): extract query builder into separate module
test(cart): add edge case for empty cart checkout
ci: add parallel test execution to GitHub Actions
chore(deps): bump fastapi from 0.111 to 0.115
```

## Commit Message Rules

| Rule | Detail |
|------|--------|
| Subject ≤ 50 chars | Concise, fits in `git log --oneline` |
| Imperative mood | "add feature" not "added feature" |
| No period at end | Subject line is a title |
| Body wraps at 72 chars | Readable in terminal |
| Body explains **why** | The diff shows *what* changed |
| Reference issues | `Closes #123`, `Fixes #456` |

### Good vs Bad Messages

| Bad | Good |
|-----|------|
| `fix stuff` | `fix(auth): prevent session hijack on token refresh` |
| `update code` | `refactor(api): extract rate limiter middleware` |
| `WIP` | `feat(search): add full-text search (Elasticsearch)` |
| `changes` | `perf(db): add composite index on users(email, org_id)` |

## Atomic Commits

Each commit should be a **single logical change** that:

- Compiles / passes linting
- Passes all tests
- Can be reverted independently
- Has a clear, meaningful message

**Anti-patterns:**
- Mixing feature code + refactoring in one commit
- "Fix review comments" without context
- Giant commits touching 20+ files across unrelated areas

## Semantic Versioning (SemVer) from Commits

Tools like `semantic-release` or `release-please` read commit types to auto-generate:

```
feat  → MINOR bump  (1.2.0 → 1.3.0)
fix   → PATCH bump  (1.2.0 → 1.2.1)
feat! → MAJOR bump  (1.2.0 → 2.0.0)
```

```
CHANGELOG.md (auto-generated)
────────────────────────────
## [1.3.0] — 2026-03-31
### Features
- auth: add OAuth2 login with Google (#45)
### Bug Fixes
- api: handle null response from payment gateway (#42)
```

## Pull Request Best Practices

| Practice | Guideline |
|----------|-----------|
| **Size** | < 400 lines changed (review fatigue grows exponentially) |
| **Focus** | One feature / one fix per PR |
| **Title** | Follow commit convention: `feat(scope): description` |
| **Description** | What, why, how to test, screenshots if UI |
| **Self-review** | Review your own diff before requesting others |
| **Tests** | Add or update tests covering the change |
| **CI green** | All checks must pass before review |
| **Link issues** | `Closes #123` in description |

### PR Description Template

```markdown
## What
Brief description of the change.

## Why
Context / motivation / link to issue.

## How to Test
1. Step one
2. Step two
3. Expected result

## Checklist
- Tests added / updated
- Docs updated (if applicable)
- No breaking changes (or documented)
```

## Code Review Guidelines

| Reviewer should | Reviewer should not |
|-----------------|---------------------|
| Focus on logic, edge cases, security | Nitpick style (automate with linters) |
| Ask "what if?" questions | Rewrite entire approach in comments |
| Approve when "good enough" | Block for personal preference |
| Suggest, don't demand | Ignore PR for days |

**Response time target:** First review within 4 working hours. Smaller PRs get faster reviews.
