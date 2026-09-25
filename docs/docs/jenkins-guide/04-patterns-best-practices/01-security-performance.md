---
date: 2026-08-25
tags:
  - jenkins
  - ci-cd
  - security
---

# Security & Performance

How to keep pipelines secure and fast.

---

## Security

### Credential Management

```groovy
// GOOD: Use Jenkins credentials
environment {
    API_TOKEN = credentials('api-token-id')
}

// BAD: Never hardcode secrets
environment {
    API_TOKEN = 'sk-12345-secret'  // NEVER do this!
}
```

### Security Rules

| Rule | Why |
|------|-----|
| Never hardcode secrets | Anyone with repo access sees them |
| Use `credentials()` or `withCredentials` | Jenkins masks them in logs |
| Limit credential scope | Use folder-level credentials, not global |
| Audit credential usage | Jenkins tracks which jobs use which credentials |
| Do not print secrets | Even masked, avoid `echo` with credentials |
| Review Jenkinsfile changes | Pipeline code can access Jenkins internals |

### Sandbox Security

Jenkins runs Declarative Pipelines in a **Groovy sandbox**. Some operations need admin approval:

```groovy
// These may need script approval in Jenkins:
// - new File('/etc/hosts')
// - System.getenv('PATH')
// - java.net.URL

// Instead, use built-in steps:
steps {
    sh 'cat /etc/hosts'                    // Use shell
    echo "${env.PATH}"                     // Use env
    sh 'curl -s https://example.com'       // Use curl
}
```

### Input for Manual Approval

Use `input` step for deployment gates:

```groovy
stage('Deploy to Production') {
    when { branch 'main' }
    steps {
        input(
            message: 'Deploy to production?',
            ok: 'Deploy',
            submitter: 'admin,deployers'
        )
        sh 'make deploy-production'
    }
}
```

!!! warning "Put input outside agent"
    Use `agent none` for the input stage to avoid holding an executor while waiting for approval.

---

## Performance

### Caching Dependencies

```groovy
pipeline {
    agent { docker { image 'python:3.12' } }

    stages {
        stage('Install') {
            steps {
                // Cache pip packages
                sh '''
                    pip install --cache-dir=.pip-cache -r requirements.txt
                '''
            }
        }
    }
}
```

For persistent cache across builds, mount a volume:

```groovy
agent {
    docker {
        image 'python:3.12'
        args '-v pip-cache:/root/.cache/pip'
    }
}
```

### Parallel Execution

Speed up builds by running independent tasks in parallel:

```groovy
stage('Quality') {
    parallel {
        stage('Unit Tests')  { steps { sh 'pytest tests/unit/' } }
        stage('Lint')        { steps { sh 'ruff check src/' } }
        stage('Type Check')  { steps { sh 'mypy src/' } }
        stage('Security')    { steps { sh 'bandit -r src/' } }
    }
}
```

### Avoid Unnecessary Work

```groovy
// Skip checkout if you do it manually
options { skipDefaultCheckout() }

// Shallow clone for faster checkout
steps {
    checkout([
        $class: 'GitSCM',
        branches: [[name: env.BRANCH_NAME]],
        extensions: [[$class: 'CloneOption', depth: 1, shallow: true]],
        userRemoteConfigs: [[url: env.GIT_URL]]
    ])
}

// Skip stages when files did not change
stage('Frontend Tests') {
    when { changeset 'frontend/**' }
    steps { sh 'npm test' }
}
```

### Resource Limits

```groovy
options {
    timeout(time: 30, unit: 'MINUTES')   // Pipeline timeout
    disableConcurrentBuilds()              // One build at a time
    buildDiscarder(logRotator(            // Clean old builds
        numToKeepStr: '20',
        daysToKeepStr: '30'
    ))
}
```

### Stash and Unstash

Share files between stages (especially with different agents):

```groovy
stage('Build') {
    steps {
        sh 'make build'
        stash includes: 'dist/**', name: 'build-output'
    }
}
stage('Deploy') {
    agent { label 'deploy-server' }
    steps {
        unstash 'build-output'
        sh 'deploy.sh dist/'
    }
}
```

---

## Troubleshooting
## Quick Checklist

- Use **`credentials()`** for all secrets
- Set **`timeout`** and **`disableConcurrentBuilds`** on every pipeline
- **Parallelize** independent stages
- **Cache** dependencies between builds
- Use **shallow clone** for large repos
- Clean workspace with **`cleanWs()`** in post/cleanup
- Use **`when { changeset }`** to skip irrelevant stages
- Use **`stash/unstash`** to share files between stages
