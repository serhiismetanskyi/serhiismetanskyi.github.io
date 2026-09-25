---
date: 2026-08-25
tags:
  - jenkins
  - ci-cd
---

# Real-World Templates

Complete Jenkinsfile examples you can copy and adapt for your projects.

---

## Python Project Pipeline

```groovy
pipeline {
    agent { docker { image 'python:3.12' } }

    options {
        timeout(time: 20, unit: 'MINUTES')
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '10'))
        timestamps()
    }

    environment {
        PIP_CACHE_DIR = '.pip-cache'
    }

    stages {
        stage('Install') {
            steps {
                sh '''
                    python -m pip install --upgrade pip
                    pip install -r requirements.txt
                '''
            }
        }

        stage('Quality') {
            parallel {
                stage('Lint') {
                    steps { sh 'ruff check src/' }
                }
                stage('Type Check') {
                    steps { sh 'mypy src/' }
                }
                stage('Tests') {
                    steps {
                        sh 'pytest tests/ --junitxml=report.xml --cov=src --cov-report=xml'
                    }
                    post {
                        always {
                            junit 'report.xml'
                        }
                    }
                }
            }
        }

        stage('Build') {
            when { branch 'main' }
            steps {
                sh 'python -m build'
                archiveArtifacts artifacts: 'dist/*', fingerprint: true
            }
        }
    }

    post {
        cleanup { cleanWs() }
    }
}
```

---

## Docker Build & Push Pipeline

```groovy
pipeline {
    agent any

    options {
        timeout(time: 30, unit: 'MINUTES')
        disableConcurrentBuilds()
        timestamps()
    }

    environment {
        REGISTRY = 'registry.example.com'
        IMAGE = "${REGISTRY}/my-app"
        TAG = "${env.BRANCH_NAME}-${env.BUILD_NUMBER}"
    }

    stages {
        stage('Build Image') {
            steps {
                sh "docker build -t ${IMAGE}:${TAG} ."
            }
        }

        stage('Test Image') {
            steps {
                sh """
                    docker run --rm ${IMAGE}:${TAG} pytest tests/
                """
            }
        }

        stage('Push Image') {
            when { branch 'main' }
            steps {
                withCredentials([
                    usernamePassword(
                        credentialsId: 'docker-registry',
                        usernameVariable: 'REG_USER',
                        passwordVariable: 'REG_PASS'
                    )
                ]) {
                    sh '''
                        echo ${REG_PASS} | docker login ${REGISTRY} -u ${REG_USER} --password-stdin
                        docker push ${IMAGE}:${TAG}
                        docker tag ${IMAGE}:${TAG} ${IMAGE}:latest
                        docker push ${IMAGE}:latest
                    '''
                }
            }
        }

        stage('Deploy') {
            when { branch 'main' }
            steps {
                input(message: 'Deploy to production?', ok: 'Deploy')
                sh "kubectl set image deployment/my-app app=${IMAGE}:${TAG}"
            }
        }
    }

    post {
        always {
            sh "docker rmi ${IMAGE}:${TAG} || true"
        }
        cleanup { cleanWs() }
    }
}
```

---

## Tips for Building Your Own

1. **Start from a template** — copy the closest example above
2. **Add stages incrementally** — do not build the full pipeline at once
3. **Test locally** with the Jenkins Pipeline Linter (available via Jenkins HTTP API)
4. **Use Replay** in Jenkins UI to test changes without committing
5. **Move to Shared Library** when patterns repeat across 3+ projects
