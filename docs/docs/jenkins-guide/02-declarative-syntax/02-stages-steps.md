---
date: 2026-08-23
tags:
  - jenkins
  - ci-cd
---

# Stages & Steps

Stages define **what** your pipeline does. Steps define **how** each stage does it.

---

## Stages Block

All stages live inside a single `stages { }` block:

```groovy
stages {
    stage('Build') {
        steps { sh 'make build' }
    }
    stage('Test') {
        steps { sh 'make test' }
    }
    stage('Deploy') {
        steps { sh 'make deploy' }
    }
}
```

Stages run **in order**, top to bottom. If one stage fails, the pipeline stops (unless you handle it).

---

## Steps

Steps are the actual commands. Each `stage` needs a `steps { }` block.

### Shell Commands

```groovy
steps {
    // Single command
    sh 'pytest tests/'

    // Multi-line script
    sh '''
        pip install -r requirements.txt
        python -m pytest --cov=src tests/
        python -m ruff check src/
    '''
}
```

### Built-In Steps

| Step | Purpose | Example |
|------|---------|---------|
| `echo` | Print message | `echo 'Build started'` |
| `sh` | Run shell command | `sh 'make build'` |
| `bat` | Run Windows command | `bat 'msbuild app.sln'` |
| `checkout scm` | Checkout source code | `checkout scm` |
| `dir('path')` | Change directory | `dir('subdir') { sh 'ls' }` |
| `sleep` | Wait | `sleep(time: 10, unit: 'SECONDS')` |
| `error` | Fail the build | `error 'Deploy blocked'` |
| `retry` | Retry steps | `retry(3) { sh 'flaky.sh' }` |
| `timeout` | Limit step duration | `timeout(5) { sh 'slow.sh' }` |

---

## Capturing Output

Save command output to a variable:

```groovy
stage('Version') {
    steps {
        script {
            env.APP_VERSION = sh(
                script: 'cat VERSION',
                returnStdout: true
            ).trim()
        }
        echo "Version: ${env.APP_VERSION}"
    }
}
```

Check exit code without failing:

```groovy
stage('Check') {
    steps {
        script {
            def status = sh(
                script: 'test -f config.yml',
                returnStatus: true
            )
            if (status != 0) {
                echo 'Config file not found, using defaults'
            }
        }
    }
}
```

---

## File Operations

```groovy
steps {
    // Write file
    writeFile file: 'config.txt', text: 'key=value'

    // Read file
    script {
        def content = readFile('config.txt').trim()
        echo "Config: ${content}"
    }

    // Check file exists
    script {
        if (fileExists('Dockerfile')) {
            echo 'Dockerfile found'
        }
    }
}
```

---

## Artifacts

Save files from a build for later use:

```groovy
stage('Build') {
    steps {
        sh 'make build'
    }
    post {
        success {
            archiveArtifacts artifacts: 'dist/**/*', fingerprint: true
        }
    }
}
```

Copy artifacts from another job:

```groovy
steps {
    copyArtifacts(
        projectName: 'my-library',
        filter: 'dist/*.whl',
        target: 'libs/'
    )
}
```

---

## Test Reports

Publish test results in Jenkins UI:

```groovy
stage('Test') {
    steps {
        sh 'pytest --junitxml=report.xml tests/'
    }
    post {
        always {
            junit 'report.xml'
        }
    }
}
```

---

## Best Practices

- Name stages clearly: `'Run Unit Tests'` not `'Step 2'`
- Use **multi-line `sh`** blocks to group related commands
- Use **`returnStdout`** and **`returnStatus`** instead of complex Groovy logic
- Always publish **test reports** with `junit` step
- Archive important **artifacts** for debugging
- Keep logic in **shell scripts** — the Jenkinsfile orchestrates
