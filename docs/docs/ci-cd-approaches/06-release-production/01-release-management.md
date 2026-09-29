---
date: 2026-08-30
tags:
  - ci-cd
  - devops
---

# Release Management

## Semantic Versioning

The standard versioning scheme for software releases.

```
MAJOR.MINOR.PATCH

2.1.3
│ │ └── 3: Backwards-compatible bug fix
│ └──── 1: New backwards-compatible feature
└────── 2: Breaking change
```

### Rules

| Change Type | Version Bump | Example |
|-------------|-------------|---------|
| Bug fix, no API change | PATCH | 1.4.2 → 1.4.3 |
| New feature, no breaking change | MINOR | 1.4.3 → 1.5.0 |
| Breaking API change | MAJOR | 1.5.0 → 2.0.0 |

### Pre-Release Tags

```
1.5.0-alpha.1    # very early, not for production
1.5.0-beta.2     # feature complete, testing phase
1.5.0-rc.1       # release candidate — production-like testing
1.5.0            # stable release
```

---

## Automated Versioning in CI

### Conventional Commits + semantic-release

`semantic-release` reads commit messages and bumps versions automatically:

```bash
feat: add OAuth2 login      → MINOR bump
fix: correct email validation → PATCH bump
feat!: redesign auth API    → MAJOR bump (! = breaking)
```


```yaml
# GitHub Actions — automated release
- name: Semantic Release
  uses: cycjimmy/semantic-release-action@v4
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```


Output: creates git tag, GitHub Release, generates CHANGELOG.md.

### Git Tag-Based Release


```yaml
on:
  push:
    tags:
      - 'v[0-9]+.[0-9]+.[0-9]+'

jobs:
  release:
    steps:
      - name: Extract version
        run: echo "VERSION=${GITHUB_REF_NAME#v}" >> $GITHUB_ENV

      - name: Build and push release image
        run: |
          docker build -t ghcr.io/org/api:${{ env.VERSION }} .
          docker push ghcr.io/org/api:${{ env.VERSION }}
```


---

## Release Strategies

### Release Trains

Fixed-schedule releases. Every Monday at 10:00, whatever is in `main` ships.

Benefits:
- Predictable for stakeholders
- Encourages small, frequent commits
- Reduces big-bang release risk

Drawbacks:
- Bug fix may wait for next train
- Requires feature flags for unfinished work

### On-Demand Releases

Release whenever a change is ready and all gates pass.
This is Continuous Deployment when fully automated.

```
Merge to main → gates pass → automatic deploy
```

Benefits:
- Fastest time-to-production
- Smaller batches = easier to debug

Drawbacks:
- Requires high confidence in automated testing
- Requires fast rollback capability

---

## CHANGELOG Generation

Changelog documents what changed in each release.


```yaml
# Using git-cliff to generate CHANGELOG.md
- name: Generate CHANGELOG
  uses: orhun/git-cliff-action@v3
  with:
    config: cliff.toml
    args: --verbose
  env:
    OUTPUT: CHANGELOG.md

- name: Commit CHANGELOG
  run: |
    git config user.name "github-actions[bot]"
    git config user.email "github-actions[bot]@users.noreply.github.com"
    git add CHANGELOG.md
    git commit -m "chore: update CHANGELOG for ${{ github.ref_name }}"
    git push
```


---

## GitHub Release


```yaml
- name: Create GitHub Release
  uses: softprops/action-gh-release@v2
  with:
    tag_name: ${{ env.VERSION }}
    name: "Release ${{ env.VERSION }}"
    body_path: CHANGELOG.md
    files: |
      dist/*.whl
      dist/*.tar.gz
    draft: false
    prerelease: ${{ contains(env.VERSION, '-') }}
```
