---
date: 2026-08-23
tags:
  - jenkins
  - ci-cd
---

# Declarative Syntax

This section covers every block available in a declarative Jenkinsfile. Each page explains one concept with practical examples.

---

## Topics

| Page | What You Will Learn |
|------|-------------------|
| [**Pipeline, Agent & Options**](01-pipeline-agent-options.md) | Top-level structure, agent types, timeout, retry |
| [**Stages & Steps**](02-stages-steps.md) | Defining stages, shell commands, built-in steps |
| [**Post, Triggers & Tools**](03-post-triggers-tools.md) | Cleanup actions, build triggers, tool installation |

---

## Structure Overview

```groovy
pipeline {
    agent { ... }
    options { ... }
    environment { ... }
    triggers { ... }
    stages {
        stage('Name') {
            when { ... }
            steps { ... }
        }
    }
    post { ... }
}
```

Every keyword above has its own rules. The following pages explain each one in detail.

---
## See also
- [Digital Garden: Knowledge Base](../../index.md)
- [CI/CD](../../ci-cd-approaches/index.md)
- [Code Quality & CI/CD](../../python-guide/05-quality-cicd/index.md)
- [Docker & Docker Compose — Overview](../../tools/docker/index.md)
- [Git — Overview](../../tools/git/index.md)
- [Jenkins Pipeline Guide](../index.md)

