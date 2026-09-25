---
date: 2026-08-23
tags:
  - jenkins
  - ci-cd
---

# Declarative vs Scripted

Jenkins has two pipeline syntaxes. This page explains both and helps you choose.

---

## Quick Comparison

| Feature | Declarative | Scripted |
|---------|------------|---------|
| Syntax | Structured, predefined blocks | Free-form Groovy |
| Learning curve | Easy | Steep |
| Validation | Built-in syntax check | No validation |
| Restart from stage | Yes | No |
| Error handling | `post { }` block | `try/catch/finally` |
| Flexibility | Limited (by design) | Unlimited |
| Recommendation | **Default choice** | Only when needed |

---

## Declarative Pipeline

Declarative is the **recommended** syntax. It has clear structure and built-in validation.

```groovy
pipeline {
    agent any

    options {
        timeout(time: 30, unit: 'MINUTES')
    }

    stages {
        stage('Build') {
            steps {
                sh 'make build'
            }
        }
        stage('Test') {
            steps {
                sh 'make test'
            }
        }
    }

    post {
        always {
            echo 'Pipeline finished'
        }
        failure {
            echo 'Pipeline failed!'
        }
    }
}
```

### Advantages

- Clean, readable structure
- Syntax validation before execution
- Can restart from a failed stage
- Built-in `post` block for cleanup
- `when` conditions for conditional stages
- Easy to learn for new users

---

## Scripted Pipeline

Scripted pipeline uses full Groovy language. Use it only when declarative cannot do what you need.

```groovy
node {
    try {
        stage('Build') {
            sh 'make build'
        }
        stage('Test') {
            sh 'make test'
        }
    } catch (Exception e) {
        echo "Pipeline failed: ${e.message}"
        throw e
    } finally {
        echo 'Cleanup'
    }
}
```

### When to Use Scripted

- Complex dynamic logic (generating stages at runtime)
- Advanced Groovy scripting needs
- Legacy pipelines that already use it

!!! warning "Avoid scripted for new pipelines"
    Almost everything you need can be done with declarative syntax. Start with declarative and switch to scripted only if you hit a real limitation.

---

## Using Groovy Inside Declarative

You can use `script { }` blocks inside declarative for small pieces of Groovy logic:

```groovy
pipeline {
    agent any

    stages {
        stage('Dynamic') {
            steps {
                script {
                    def version = sh(
                        script: 'cat VERSION',
                        returnStdout: true
                    ).trim()
                    echo "Version: ${version}"
                }
            }
        }
    }
}
```

!!! tip "Keep script blocks small"
    If you have many `script { }` blocks, consider moving logic to a Shared Library instead.

---

## Migration: Scripted to Declarative

| Scripted | Declarative |
|----------|------------|
| `node { }` | `pipeline { agent any }` |
| `stage('X') { sh '...' }` | `stage('X') { steps { sh '...' } }` |
| `try/catch/finally` | `post { failure { } always { } }` |
| `if (condition) { }` | `when { expression { } }` |
| Global variables | `environment { }` block |

---

## Best Practices

- Use **Declarative** for all new pipelines
- Use **`script { }`** blocks sparingly inside declarative
- Move complex Groovy logic to **Shared Libraries**
- Keep pipeline code **simple** — use `sh` steps for heavy lifting
- Use **`post { }`** block for cleanup, notifications, and reporting
