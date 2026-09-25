---
date: 2026-08-24
tags:
  - jenkins
  - ci-cd
---

# Post, Triggers & Tools

Actions after pipeline finishes, automatic triggers, and tool configuration.

---

## Post Block

The `post` block runs after stages finish. Use it for cleanup, notifications, and reports.

```groovy
pipeline {
    agent any

    stages {
        stage('Test') {
            steps { sh 'pytest tests/' }
        }
    }

    post {
        always {
            junit '**/report.xml'
            echo 'Pipeline finished'
        }
        success {
            echo 'All tests passed!'
        }
        failure {
            echo 'Something went wrong'
        }
        cleanup {
            cleanWs()
        }
    }
}
```

### Post Conditions

| Condition | Runs When |
|-----------|-----------|
| `always` | Every time, no matter what |
| `success` | Pipeline succeeded |
| `failure` | Pipeline failed |
| `unstable` | Pipeline marked unstable (e.g. test failures) |
| `changed` | Status changed from previous build |
| `fixed` | Previous build failed, this one succeeded |
| `regression` | Previous build succeeded, this one failed |
| `aborted` | Pipeline was cancelled |
| `cleanup` | After all other post conditions (always runs) |

### Stage-Level Post

You can also use `post` inside a stage:

```groovy
stage('Test') {
    steps {
        sh 'pytest --junitxml=report.xml tests/'
    }
    post {
        always {
            junit 'report.xml'
        }
        failure {
            sh 'cat pytest-debug.log || true'
        }
    }
}
```

---

## Triggers

Automatic ways to start a pipeline.

```groovy
pipeline {
    agent any

    triggers {
        // Poll SCM every 5 minutes
        pollSCM('H/5 * * * *')

        // Run on schedule (nightly at 2 AM)
        cron('H 2 * * *')

        // Trigger when another job finishes
        upstream(
            upstreamProjects: 'build-library',
            threshold: hudson.model.Result.SUCCESS
        )
    }

    stages { /* ... */ }
}
```

### Trigger Types

| Trigger | Purpose | Example |
|---------|---------|---------|
| `pollSCM` | Check Git for changes | `pollSCM('H/5 * * * *')` |
| `cron` | Scheduled builds | `cron('H 2 * * *')` |
| `upstream` | After another job | `upstream('job-name')` |

!!! tip "Use webhooks instead of pollSCM"
    Configure GitHub/GitLab webhooks to trigger builds instantly. `pollSCM` adds delay and creates extra load on Jenkins.

### Cron Syntax

```
MINUTE  HOUR  DAY_OF_MONTH  MONTH  DAY_OF_WEEK

H/15    *     *             *      *       → every 15 minutes
H       2     *             *      *       → daily at 2 AM
H       2     *             *      1-5     → weekdays at 2 AM
```

`H` (hash) spreads load — Jenkins picks a stable random minute for each job.

---

## Tools

The `tools` block installs tools automatically (must be configured in Jenkins Global Tool Configuration):

```groovy
pipeline {
    agent any

    tools {
        jdk 'jdk-17'
        nodejs 'node-20'
        maven 'maven-3.9'
    }

    stages {
        stage('Build') {
            steps {
                sh 'java -version'
                sh 'node --version'
                sh 'mvn --version'
            }
        }
    }
}
```

!!! tip "Prefer Docker over tools"
    Instead of installing tools on Jenkins agents, use Docker images with tools pre-installed. It is more portable and reproducible.

---

## Notifications

### Slack

```groovy
post {
    success {
        slackSend(
            channel: '#ci',
            color: 'good',
            message: "Build passed: ${env.JOB_NAME} #${env.BUILD_NUMBER}"
        )
    }
    failure {
        slackSend(
            channel: '#ci',
            color: 'danger',
            message: "Build failed: ${env.JOB_NAME} #${env.BUILD_NUMBER}"
        )
    }
}
```

### Email

```groovy
post {
    failure {
        emailext(
            subject: "FAILED: ${env.JOB_NAME} #${env.BUILD_NUMBER}",
            body: "Check: ${env.BUILD_URL}",
            to: 'team@example.com'
        )
    }
}
```
