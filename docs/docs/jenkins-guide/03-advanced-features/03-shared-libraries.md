---
date: 2026-08-25
tags:
  - jenkins
  - ci-cd
---

# Shared Libraries

Reuse pipeline code across multiple projects with Jenkins Shared Libraries.

---

## Why Shared Libraries?

When 3+ projects have similar Jenkinsfiles, you end up copying the same code. Shared Libraries solve this by putting common logic in a separate Git repository.

**Benefits:**

- Write once, use in many pipelines
- Update logic in one place — all pipelines get the update
- Keep Jenkinsfiles short and clean
- Test library code separately

---

## Library Structure

```
jenkins-shared-library/
├── vars/                   ← Global pipeline steps
│   ├── buildDocker.groovy
│   ├── runTests.groovy
│   └── notifySlack.groovy
├── src/                    ← Groovy classes (optional)
│   └── com/
│       └── example/
│           └── Config.groovy
├── resources/              ← Non-Groovy files (templates, configs)
│   └── deploy-template.yaml
└── README.md
```

| Folder | Purpose |
|--------|---------|
| `vars/` | Custom pipeline steps — one file per step |
| `src/` | Groovy classes for complex logic |
| `resources/` | Static files (templates, configs) |

---

## Creating a Custom Step

### `vars/runTests.groovy`

```groovy
def call(Map config = [:]) {
    def testDir = config.get('testDir', 'tests/')
    def marker = config.get('marker', '')
    def markerArg = marker ? "-m ${marker}" : ''

    stage('Run Tests') {
        sh """
            pip install -r requirements.txt
            pytest ${testDir} ${markerArg} --junitxml=report.xml -v
        """
        junit 'report.xml'
    }
}
```

### `vars/buildDocker.groovy`

```groovy
def call(Map config) {
    def image = config.image
    def tag = config.get('tag', env.BUILD_NUMBER)
    def dockerfile = config.get('dockerfile', 'Dockerfile')

    stage('Build Docker Image') {
        sh "docker build -t ${image}:${tag} -f ${dockerfile} ."
    }
}
```

### `vars/notifySlack.groovy`

```groovy
def call(String status) {
    def color = status == 'SUCCESS' ? 'good' : 'danger'
    def message = "${env.JOB_NAME} #${env.BUILD_NUMBER}: ${status}"
    slackSend(channel: '#ci', color: color, message: message)
}
```

---

## Using the Library

### Method 1: Configure in Jenkins (Recommended)

Go to **Manage Jenkins → System → Global Pipeline Libraries** and add your library repository. Then use it in Jenkinsfile:

```groovy
@Library('my-shared-library') _

pipeline {
    agent { docker { image 'python:3.12' } }

    stages {
        stage('Build') {
            steps {
                buildDocker(image: 'my-app')
            }
        }
        stage('Test') {
            steps {
                runTests(testDir: 'tests/', marker: 'unit')
            }
        }
    }

    post {
        always {
            notifySlack(currentBuild.result ?: 'SUCCESS')
        }
    }
}
```

### Method 2: Load from Git directly

```groovy
@Library('my-library@main') _
```

!!! tip "Pin library version"
    Use `@Library('my-library@v1.0')` with tags to avoid breaking pipelines when the library changes.

---

## Using Resources

Load files from the `resources/` folder:

```groovy
// vars/deployHelm.groovy
def call(Map config) {
    def template = libraryResource('deploy-template.yaml')
    writeFile file: 'deploy.yaml', text: template
    sh "helm upgrade --install ${config.app} -f deploy.yaml"
}
```

---

## Pipeline Templates

Create a full pipeline as a library step:

### `vars/standardPipeline.groovy`

```groovy
def call(Map config) {
    pipeline {
        agent { docker { image config.get('image', 'python:3.12') } }

        options {
            timeout(time: 30, unit: 'MINUTES')
            disableConcurrentBuilds()
        }

        stages {
            stage('Test') {
                steps { sh 'pytest tests/ --junitxml=report.xml' }
                post { always { junit 'report.xml' } }
            }
            stage('Build') {
                steps { sh "docker build -t ${config.image}:${env.BUILD_NUMBER} ." }
            }
            stage('Deploy') {
                when { branch 'main' }
                steps { sh "deploy.sh ${config.get('env', 'staging')}" }
            }
        }
    }
}
```

Then every project just has a short Jenkinsfile:

```groovy
@Library('my-shared-library') _

standardPipeline(image: 'my-service')
```
