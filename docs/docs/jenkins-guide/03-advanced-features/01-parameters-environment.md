---
date: 2026-08-24
tags:
  - jenkins
  - ci-cd
---

# Parameters & Environment

Make your pipelines configurable with parameters, environment variables, and credentials.

---

## Parameters

Parameters let users provide input when starting a build.

```groovy
pipeline {
    agent any

    parameters {
        string(
            name: 'BRANCH',
            defaultValue: 'main',
            description: 'Branch to build'
        )
        choice(
            name: 'ENVIRONMENT',
            choices: ['dev', 'staging', 'production'],
            description: 'Target environment'
        )
        booleanParam(
            name: 'SKIP_TESTS',
            defaultValue: false,
            description: 'Skip test stage'
        )
        password(
            name: 'DEPLOY_TOKEN',
            description: 'Deployment token'
        )
    }

    stages {
        stage('Info') {
            steps {
                echo "Branch: ${params.BRANCH}"
                echo "Environment: ${params.ENVIRONMENT}"
            }
        }
        stage('Test') {
            when { expression { !params.SKIP_TESTS } }
            steps {
                sh 'pytest tests/'
            }
        }
    }
}
```

### Parameter Types

| Type | Description | Access |
|------|-------------|--------|
| `string` | Free text input | `params.NAME` |
| `choice` | Dropdown list | `params.NAME` |
| `booleanParam` | Checkbox (true/false) | `params.NAME` |
| `password` | Masked text input | `params.NAME` |
| `text` | Multi-line text area | `params.NAME` |

---

## Environment Variables

Define variables available to all stages.

```groovy
pipeline {
    agent any

    environment {
        APP_NAME = 'my-service'
        VERSION = '1.0.0'
        DOCKER_REGISTRY = 'registry.example.com'
    }

    stages {
        stage('Build') {
            environment {
                BUILD_TAG = "${env.APP_NAME}:${env.VERSION}-${env.BUILD_NUMBER}"
            }
            steps {
                echo "Building: ${env.BUILD_TAG}"
                sh "docker build -t ${env.BUILD_TAG} ."
            }
        }
    }
}
```

### Built-In Variables

Jenkins provides many variables automatically:

| Variable | Value |
|----------|-------|
| `env.BUILD_NUMBER` | Build number (1, 2, 3...) |
| `env.BUILD_URL` | URL to the build page |
| `env.JOB_NAME` | Name of the pipeline job |
| `env.BRANCH_NAME` | Git branch name (Multibranch only) |
| `env.WORKSPACE` | Absolute path to workspace |
| `env.GIT_COMMIT` | Current Git commit SHA |
| `env.GIT_BRANCH` | Git branch being built |

---

## Credentials

Safely use secrets in your pipeline. Never hardcode passwords or tokens.

### Credentials Binding

```groovy
pipeline {
    agent any

    environment {
        // Username + password credential
        DB_CREDS = credentials('database-credentials')
        // Secret text
        API_KEY = credentials('api-key-id')
    }

    stages {
        stage('Deploy') {
            steps {
                // Username + password creates three variables:
                // DB_CREDS       → username:password
                // DB_CREDS_USR   → username
                // DB_CREDS_PSW   → password
                sh '''
                    echo "Connecting as ${DB_CREDS_USR}"
                    deploy --token ${API_KEY}
                '''
            }
        }
    }
}
```

### withCredentials Block

For more control, use `withCredentials` inside steps:

```groovy
stage('Push Image') {
    steps {
        withCredentials([
            usernamePassword(
                credentialsId: 'docker-hub',
                usernameVariable: 'DOCKER_USER',
                passwordVariable: 'DOCKER_PASS'
            )
        ]) {
            sh '''
                echo ${DOCKER_PASS} | docker login -u ${DOCKER_USER} --password-stdin
                docker push ${DOCKER_REGISTRY}/${APP_NAME}:${VERSION}
            '''
        }
    }
}
```

### Credential Types

| Type | Jenkins ID | Use |
|------|-----------|-----|
| Secret text | `string` | API keys, tokens |
| Username + Password | `usernamePassword` | Database, registry login |
| SSH Key | `sshUserPrivateKey` | Git clone, server access |
| Secret file | `file` | Certificates, config files |

!!! warning "Never print credentials"
    Jenkins masks credentials in logs, but avoid `echo` or `print` with credential variables. Never write them to files that get archived.

---

## Best Practices

- Use **parameters** for values that change between builds
- Define shared variables in **`environment { }`** at pipeline level
- Use stage-level **`environment { }`** for stage-specific values
- Always use **`credentials()`** for secrets — never hardcode them
- Prefer **`withCredentials`** block for fine-grained credential scope
- Use **meaningful names** for credential IDs in Jenkins
