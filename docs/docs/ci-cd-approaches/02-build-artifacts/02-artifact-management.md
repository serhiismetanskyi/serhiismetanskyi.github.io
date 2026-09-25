---
date: 2026-08-27
tags:
  - ci-cd
  - devops
---

# Artifact Management

## What Is an Artifact

An artifact is the **immutable output** of a build stage that is promoted through environments.

```
Build once → push artifact → deploy the same artifact to staging, then production
```

Never rebuild for production. An artifact deployed to staging must be the exact same
binary/image that reaches production. Rebuilding introduces variance.

---

## Artifact Types

| Type | Example | Storage |
|------|---------|---------|
| Docker image | `ghcr.io/org/api:v1.4.2` | Container registry |
| Python wheel | `myapp-1.4.2-py3-none-any.whl` | PyPI / Nexus |
| Archive | `api-v1.4.2.tar.gz` | S3 / GCS / Nexus |
| Helm chart | `api-1.4.2.tgz` | Helm repo / OCI registry |

---

## Versioning

### Semantic Versioning (SemVer)

```
MAJOR.MINOR.PATCH

1.4.2
│ │ └── Bug fix, no API change
│ └──── New feature, backwards compatible
└────── Breaking change
```

Pre-release and build metadata:
```
1.4.2-rc.1           # release candidate
1.4.2+build.20260330 # build metadata (ignored in comparisons)
```

### CI-Friendly Versioning Strategies

| Strategy | Format | When to Use |
|----------|--------|-------------|
| Git SHA | `abc1234` | Every commit build |
| SemVer + SHA | `1.4.2-abc1234` | Release builds |
| Branch + build number | `main-142` | Short-lived branch artifacts |
| Date-based | `2026.03.30.1` | Services with continuous deploy |


```yaml
# Generate version tag from git
- name: Set version
  run: echo "VERSION=$(git describe --tags --always)" >> $GITHUB_ENV

- name: Build and push
  run: |
    docker build -t ghcr.io/org/api:${{ env.VERSION }} .
    docker push ghcr.io/org/api:${{ env.VERSION }}
```


---

## Container Registry


```yaml
# Login and push to GitHub Container Registry
- name: Log in to registry
  uses: docker/login-action@v3
  with:
    registry: ghcr.io
    username: ${{ github.actor }}
    password: ${{ secrets.GITHUB_TOKEN }}

- name: Build and push
  uses: docker/build-push-action@v5
  with:
    push: true
    tags: |
      ghcr.io/${{ github.repository }}:${{ github.sha }}
      ghcr.io/${{ github.repository }}:latest
```


### Image Tagging Strategy

| Tag | Meaning | Auto-updated |
|-----|---------|-------------|
| `latest` | Most recent main build | Yes |
| `v1.4.2` | Specific release | No (immutable) |
| `sha-abc1234` | Exact commit | No (immutable) |
| `main-142` | Branch + build number | Overwritten per build |

Never use `latest` in production deployments. Always pin to an immutable tag.

---

## Artifact Retention

Store artifacts long enough for rollback, not forever.

| Environment | Retention |
|-------------|----------|
| PR builds | 7 days |
| Main branch builds | 30 days |
| Tagged releases | 1 year |
| Production releases | Indefinitely |


```yaml
# GitHub Actions artifact upload with retention
- uses: actions/upload-artifact@v4
  with:
    name: dist-${{ github.sha }}
    path: dist/
    retention-days: 30
```


---

## Promotion Pattern

The artifact moves through environments unchanged:

```
Build → push image:sha-abc1234
           │
           ▼
        Staging  (deploy image:sha-abc1234)
        Smoke tests pass
           │
           ▼
        Production (deploy same image:sha-abc1234)
```

Each promotion updates the deployment, not the artifact.
The image built at commit `abc1234` is identical in staging and production.
