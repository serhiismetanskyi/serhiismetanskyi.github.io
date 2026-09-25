---
date: 2026-08-22
tags:
  - jenkins
  - ci-cd
---

# What Is a Jenkinsfile

A Jenkinsfile is a text file that defines your CI/CD pipeline. It lives in your repository and Jenkins reads it automatically.

---

## Pipeline as Code

Instead of clicking buttons in the Jenkins UI, you write your pipeline in a file.

**Benefits:**

- Pipeline is **version controlled** (Git history)
- Changes go through **code review** (pull requests)
- Pipeline is **reproducible** across branches
- Easy to **share and copy** between projects
- Serves as **documentation** of your build process

---

## Where to Put It

Place the `Jenkinsfile` (no extension) in the **root** of your repository:

```
my-project/
├── src/
├── tests/
├── Jenkinsfile        ← here
├── README.md
└── pyproject.toml
```

!!! tip "File name"
    The default name is `Jenkinsfile` (capital J, no extension). You can use a custom path in Multibranch Pipeline settings.

---

## Minimal Jenkinsfile

```groovy
pipeline {
    agent any

    stages {
        stage('Build') {
            steps {
                echo 'Building...'
            }
        }
        stage('Test') {
            steps {
                echo 'Testing...'
            }
        }
        stage('Deploy') {
            steps {
                echo 'Deploying...'
            }
        }
    }
}
```

### What Each Part Does

| Part | Purpose |
|------|---------|
| `pipeline { }` | Top-level block — wraps everything |
| `agent any` | Run on any available Jenkins agent |
| `stages { }` | Container for all stages |
| `stage('Name') { }` | One logical step (Build, Test, Deploy) |
| `steps { }` | Actual commands inside a stage |

---

## How Jenkins Runs It

1. You push code to Git
2. Jenkins detects the change (webhook or polling)
3. Jenkins reads the `Jenkinsfile` from your branch
4. Jenkins executes each stage in order
5. Results appear in the Jenkins UI (pass/fail, logs, artifacts)

---

## Pipeline Types

| Type | Description | Use Case |
|------|-------------|----------|
| **Single Branch** | One pipeline for one branch | Simple projects |
| **Multibranch** | Auto-creates pipelines for each branch | Most projects |
| **Organization Folder** | Scans all repos in a GitHub/GitLab org | Large organizations |

!!! tip "Use Multibranch Pipeline"
    Multibranch is the most common choice. It creates a pipeline for every branch that has a `Jenkinsfile`.

---

## Running Shell Commands

The most common step is running shell commands:

```groovy
steps {
    sh 'echo "Hello from shell"'
    sh 'python -m pytest tests/'
    sh '''
        echo "Multi-line script"
        pip install -r requirements.txt
        python -m pytest --cov=src
    '''
}
```

| Step | Platform | Example |
|------|----------|---------|
| `sh` | Linux / macOS | `sh 'make build'` |
| `bat` | Windows | `bat 'msbuild project.sln'` |
| `powershell` | Windows PowerShell | `powershell 'Get-Process'` |

---

## Best Practices

- Always store Jenkinsfile **in the repository** (not in Jenkins UI)
- Use **Multibranch Pipeline** for most projects
- Keep the Jenkinsfile **simple** — move complex logic to shell scripts
- Use **meaningful stage names** that describe what happens
- Start with the **minimal example** and add features as needed
