---
date: 2026-08-23
tags:
  - jenkins
  - ci-cd
---

# Pipeline, Agent & Options

The three blocks that set up your pipeline: where it runs and how it behaves.

---

## The `pipeline` Block

Every declarative Jenkinsfile starts with `pipeline { }`. All other blocks go inside it.

```groovy
pipeline {
    agent any
    stages {
        stage('Hello') {
            steps {
                echo 'Hello, World!'
            }
        }
    }
}
```

---

## Agent

The `agent` block tells Jenkins **where** to run the pipeline.

### Agent Types

```groovy
// Run on any available agent
agent any

// Do not allocate an agent at pipeline level (define per stage)
agent none

// Run on agent with specific label
agent { label 'linux' }

// Run inside a Docker container
agent {
    docker {
        image 'python:3.12'
        args '-v /tmp:/tmp'
    }
}

// Run inside a Docker container built from Dockerfile
agent {
    dockerfile {
        filename 'Dockerfile.ci'
        dir 'docker'
    }
}

// Run inside Kubernetes pod
agent {
    kubernetes {
        yaml '''
            apiVersion: v1
            kind: Pod
            spec:
              containers:
              - name: python
                image: python:3.12
                command: ['sleep', '3600']
        '''
    }
}
```

| Agent Type | When to Use |
|-----------|------------|
| `any` | Simple projects, default choice |
| `none` | Different agents per stage |
| `label` | Specific machine requirements |
| `docker` | Isolated, reproducible builds |
| `dockerfile` | Custom build environments |
| `kubernetes` | Cloud-native, scalable builds |

!!! tip "Docker agent is great for testing"
    Using `docker` agent gives you a clean environment every time. No leftover files from previous builds.

---

## Per-Stage Agent

When you use `agent none` at pipeline level, define agent in each stage:

```groovy
pipeline {
    agent none

    stages {
        stage('Build') {
            agent { docker { image 'node:20' } }
            steps {
                sh 'npm ci && npm run build'
            }
        }
        stage('Test Python') {
            agent { docker { image 'python:3.12' } }
            steps {
                sh 'pip install -r requirements.txt && pytest'
            }
        }
    }
}
```

---

## Options

The `options` block configures pipeline-level behavior.

```groovy
pipeline {
    agent any

    options {
        timeout(time: 30, unit: 'MINUTES')
        retry(2)
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '10'))
        timestamps()
        skipDefaultCheckout()
    }

    stages { /* ... */ }
}
```

### Common Options

| Option | Purpose |
|--------|---------|
| `timeout(time: 30, unit: 'MINUTES')` | Kill pipeline after 30 minutes |
| `retry(N)` | Retry the entire pipeline N times on failure |
| `disableConcurrentBuilds()` | Only one build at a time |
| `buildDiscarder(logRotator(...))` | Keep only N recent builds |
| `timestamps()` | Add timestamps to console output |
| `skipDefaultCheckout()` | Do not auto-checkout SCM (manual checkout in steps) |
| `skipStagesAfterUnstable()` | Stop if a stage marks build unstable |

---

## Best Practices

- Use **Docker agent** for reproducible builds
- Always set a **timeout** to prevent stuck pipelines
- Use **`disableConcurrentBuilds()`** for deploy pipelines
- Keep **build history limited** with `buildDiscarder`
- Use **`agent none`** + per-stage agents when stages need different environments
