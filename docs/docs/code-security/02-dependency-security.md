---
date: 2026-06-29
tags:
  - security
  - appsec
---

# Dependency Security

Vulnerable dependencies are the **#6 OWASP Top 10** risk. Your application inherits every vulnerability from every transitive dependency in its tree.

---

## Supply Chain Threat Categories

| Category | Example | Mitigation |
|----------|---------|------------|
| **Source code** | Malicious maintainer pushes backdoor | Pin to SHA, review updates |
| **Build environment** | Compromised CI runner | Isolated builds, least-privilege |
| **Dependencies** | Typosquatting, dependency confusion | Lock files, private registries |
| **Deployment/Runtime** | Compromised container base image | Scan images, use distroless |

---

## SCA (Software Composition Analysis) Tools

SCA tools scan your dependency tree for **known CVEs**.

| Tool | Language Support | Free | CI Integration |
|------|-----------------|------|----------------|
| **Trivy** | All major | Yes (OSS) | GitHub Actions, GitLab |
| **Grype** | All major | Yes (OSS) | CLI, CI plugins |
| **Snyk** | All major | Free tier | GitHub, GitLab, Bitbucket |
| **Dependabot** | All major | Yes (GitHub) | Native GitHub |
| **pip-audit** | Python | Yes (OSS) | CLI |
| **npm audit** | Node.js | Yes (built-in) | CLI |
| **cargo audit** | Rust | Yes (OSS) | CLI |

### Quick Scan Commands

```bash
# Python
uv add --dev pip-audit
uv run pip-audit

# Node.js
npm audit
npm audit fix

# Container images
trivy image myapp:latest

# Filesystem scan (any project)
trivy fs .

# Grype alternative
grype dir:.
```

### CI Integration (GitHub Actions)

```yaml
name: Dependency Security
on: [pull_request]

jobs:
  sca-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11

      - name: Run Trivy vulnerability scanner
        uses: aquasecurity/trivy-action@9baf4a7292e4f2c4e478f2cb7161c0a1a8f5fa8c
        with:
          scan-type: fs
          scan-ref: .
          severity: CRITICAL,HIGH
          exit-code: 1
```

---

## Remediation SLAs

| Severity | Max Remediation Time | Action |
|----------|---------------------|--------|
| **Critical** (CVSS 9.0-10.0) | 7 days | Block deployment, patch immediately |
| **High** (CVSS 7.0-8.9) | 30 days | Prioritize in current sprint |
| **Medium** (CVSS 4.0-6.9) | 90 days | Schedule in backlog |
| **Low** (CVSS 0.1-3.9) | Next quarter | Track and batch-update |

---

## SBOM (Software Bill of Materials)

An SBOM lists every component in your application — lets you respond quickly when a new CVE drops.

```bash
# Generate CycloneDX SBOM
trivy fs . --format cyclonedx --output sbom.json

# Generate SPDX SBOM
trivy fs . --format spdx-json --output sbom.spdx.json

# Python-specific
pip-audit --format cyclonedx-json --output sbom.json
```

!!! tip "SBOM in CI"
    Generate an SBOM for every release. When a new CVE is announced, you can immediately identify which apps use the affected library.

---

## Lock Files & Dependency Pinning

Lock files prevent **supply chain attacks** via compromised new releases.

| Ecosystem | Lock File | Command |
|-----------|-----------|---------|
| Python (uv) | `uv.lock` | `uv lock` |
| Python (pip) | `requirements.txt` with hashes | `pip-compile --generate-hashes` |
| Node.js | `package-lock.json` | `npm ci` (installs from lock) |
| Go | `go.sum` | `go mod verify` |
| Rust | `Cargo.lock` | automatic |

**Rules:**

- Always commit lock files to Git
- CI installs from lock files, not floating version ranges
- Pin GitHub Actions to **commit SHA**, not `@v1` or `@latest`

```yaml
# BAD — vulnerable to tag hijacking
- uses: actions/checkout@v4

# GOOD — pinned to specific commit
- uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11  # v4.1.1
```

---

## Unused Dependencies

Dead dependencies increase attack surface for zero benefit.

```bash
# Python — find unused imports/deps
uv add --dev deptry
uv run deptry .

# Node.js — find unused packages
npx depcheck

# Go — find unused modules
go mod tidy
```

**Audit quarterly** — remove everything not actively used.

---

## Dependency Integrity Controls

Add integrity checks to reduce dependency confusion and tampered artifacts risk.

```bash
# Python (uv): install from lock and fail on mismatch
uv sync --frozen

# Node.js: install strictly from lockfile
npm ci
```

**Controls to enforce in CI:**

- Use only approved package registries (private mirror/proxy where possible)
- Disable implicit fallback to unknown registries
- Fail build if lockfile changes unexpectedly in PR
- Verify package checksums/signatures when ecosystem supports it

---

## License Compliance

Some licenses conflict with commercial use (e.g., GPL in a proprietary SaaS).

```bash
# Python
uv add --dev pip-licenses
uv run pip-licenses --format=table

# Node.js
npx license-checker --summary
```

Define an **approved license list** and fail the build on violations.

---

## Update Strategy

| Approach | Frequency | Tools |
|----------|-----------|-------|
| **Automated PRs** | Weekly | Dependabot, Renovate |
| **Manual review** | Monthly | `uv lock --upgrade`, `npm update` |
| **Full audit** | Quarterly | Trivy, pip-audit, npm audit |
