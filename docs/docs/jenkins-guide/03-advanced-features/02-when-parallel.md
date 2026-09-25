---
date: 2026-08-24
tags:
  - jenkins
  - ci-cd
---

# When Conditions & Parallel Stages

Control which stages run and execute independent stages at the same time.

---

## When Conditions

The `when` block decides if a stage should run.

```groovy
stage('Deploy to Production') {
    when {
        branch 'main'
    }
    steps {
        sh 'make deploy-prod'
    }
}
```

### Common Conditions

```groovy
// Run only on specific branch
when { branch 'main' }

// Run on branches matching pattern
when { branch pattern: 'release-*', comparator: 'GLOB' }

// Run only if environment matches
when { environment name: 'DEPLOY', value: 'true' }

// Run based on expression
when { expression { params.ENVIRONMENT == 'production' } }

// Run if specific file changed
when { changeset '**/*.py' }

// Run only on tagged commits
when { tag 'v*' }

// Combine conditions (all must be true)
when {
    allOf {
        branch 'main'
        environment name: 'DEPLOY', value: 'true'
    }
}

// Any condition is true
when {
    anyOf {
        branch 'main'
        branch 'develop'
    }
}

// Negation
when { not { branch 'main' } }
```

### Conditions Reference

| Condition | Description |
|-----------|-------------|
| `branch 'name'` | Current branch matches |
| `tag 'pattern'` | Building a Git tag |
| `environment name: 'X', value: 'Y'` | Env variable matches |
| `expression { ... }` | Groovy expression is true |
| `changeset 'pattern'` | Files changed match pattern |
| `triggeredBy 'cause'` | Build was triggered by specific cause |
| `allOf { }` | All nested conditions are true (AND) |
| `anyOf { }` | Any nested condition is true (OR) |
| `not { }` | Condition is false |

---

## beforeAgent

By default, `when` is evaluated after allocating an agent. Use `beforeAgent true` to skip agent allocation:

```groovy
stage('Deploy') {
    when {
        beforeAgent true
        branch 'main'
    }
    agent { label 'deploy-server' }
    steps {
        sh 'make deploy'
    }
}
```

---

## Parallel Stages

Run independent stages at the same time to save build time.

```groovy
stage('Tests') {
    parallel {
        stage('Unit Tests') {
            agent { docker { image 'python:3.12' } }
            steps {
                sh 'pytest tests/unit/'
            }
        }
        stage('Integration Tests') {
            agent { docker { image 'python:3.12' } }
            steps {
                sh 'pytest tests/integration/'
            }
        }
        stage('Lint') {
            agent { docker { image 'python:3.12' } }
            steps {
                sh 'ruff check src/'
            }
        }
    }
}
```

### failFast

Stop all parallel branches if one fails:

```groovy
stage('Tests') {
    failFast true
    parallel {
        stage('Unit') {
            steps { sh 'pytest tests/unit/' }
        }
        stage('Lint') {
            steps { sh 'ruff check src/' }
        }
    }
}
```

---

## Matrix Builds

Run the same steps across multiple combinations of axes:

```groovy
stage('Test Matrix') {
    matrix {
        axes {
            axis {
                name 'PYTHON_VERSION'
                values '3.10', '3.11', '3.12'
            }
        }
        stages {
            stage('Test') {
                agent {
                    docker { image "python:${PYTHON_VERSION}" }
                }
                steps {
                    sh 'pytest tests/'
                }
            }
        }
    }
}
```

This creates 3 jobs (one per Python version) and is easy to maintain.

---

## Best Practices

- Use **`when`** to skip stages that do not apply (saves time)
- Use **`beforeAgent true`** in `when` to avoid allocating unnecessary agents
- **Parallelize** independent stages (unit tests, lint, security scan)
- Use **`failFast true`** to get quick feedback on failures
- Use **matrix** for multi-version or multi-platform testing
- Do not parallelize stages that share workspace or have dependencies
