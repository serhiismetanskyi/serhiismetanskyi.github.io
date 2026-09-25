---
description: Knowledge base on architecture, security, QA and tooling.
hide:
  - toc
---

# Docs

This is my Digital Garden — a knowledge base for QA and Test Automation Engineers, built around best practices, practical guides, and real implementation examples.

Browse topics below, use the sidebar or press ++ctrl+k++ to search.

## Architecture & Design

<div class="kb-sections" markdown>

<div class="kb-section" markdown>

### :material-api: [API Architectures](api-architectures/index.md)

REST, GraphQL, gRPC, WebSocket, cross-cutting concerns, architecture decision factors

- [REST](api-architectures/01-rest/index.md)
- [GraphQL](api-architectures/02-graphql/index.md)
- [gRPC](api-architectures/03-grpc/index.md)
- [WebSocket](api-architectures/04-websocket/index.md)
- [Cross Cutting](api-architectures/05-cross-cutting/index.md)
- [Decision Factors](api-architectures/06-decision-factors/index.md)

</div>

<div class="kb-section" markdown>

### :material-server-network: [Client–Server Architecture](client-server-architecture/index.md)

Core model, edge layer, traffic/service mesh, connections, scalability, reliability, …

- [Core Model](client-server-architecture/01-core-model/index.md)
- [Edge Layer](client-server-architecture/02-edge-layer/index.md)
- [Traffic Service Mesh](client-server-architecture/03-traffic-service-mesh/index.md)
- [Connections Backpressure](client-server-architecture/04-connections-backpressure/index.md)
- [Client Scalability Performance](client-server-architecture/05-client-scalability-performance/index.md)
- [Reliability Security Observability](client-server-architecture/06-reliability-security-observability/index.md)
- [All 7 sections](client-server-architecture/index.md){ .kb-more }

</div>

<div class="kb-section" markdown>

### :material-puzzle-outline: [Software Design Patterns and Principles](software-design-patterns/index.md)

OOP, SOLID, DRY/KISS, clean code, creational/structural/behavioral patterns, architecture, …

- [Design Principles](software-design-patterns/01-design-principles/index.md)
- [Creational Patterns](software-design-patterns/02-creational-patterns/index.md)
- [Structural Patterns](software-design-patterns/03-structural-patterns/index.md)
- [Behavioral Patterns](software-design-patterns/04-behavioral-patterns/index.md)
- [Composition Architectural](software-design-patterns/05-composition-architectural/index.md)
- [Frontend Cross Layer](software-design-patterns/06-frontend-cross-layer/index.md)
- [All 7 sections](software-design-patterns/index.md){ .kb-more }

</div>

<div class="kb-section" markdown>

### :material-robot-outline: [Agentic AI Architecture](agentic-ai-architecture/index.md)

Agent fundamentals, multi-agent patterns, memory/RAG, vectorless RAG, tool integration, …

- [Agentic AI — Fundamentals & Core Components](agentic-ai-architecture/01-fundamentals-components.md)
- [Multi-Agent Architecture Patterns](agentic-ai-architecture/02-multi-agent-patterns.md)
- [Memory & Retrieval-Augmented Generation (RAG)](agentic-ai-architecture/03-memory-rag.md)
- [Tool Integration & Prompt Engineering](agentic-ai-architecture/04-tool-integration-prompting.md)
- [LLM Configuration, Model Selection & Security](agentic-ai-architecture/05-llm-config-security.md)
- [Testing, Evaluation & Observability](agentic-ai-architecture/06-testing-observability.md)
- [All 8 sections](agentic-ai-architecture/index.md){ .kb-more }

</div>

<div class="kb-section" markdown>

### :material-brain: [AI Skills for Coding Agents](ai-skills/index.md)

SKILL.md standard, universal standard (2026), practical playbook, …

- [What Is a Skill](ai-skills/01-what-is-a-skill.md)
- [How Agents Load Skills](ai-skills/02-how-agents-load-skills.md)
- [Skill Packaging](ai-skills/03-skill-packaging.md)
- [Orchestration & Workflows](ai-skills/04-orchestration-workflows.md)
- [Evaluation & Security](ai-skills/05-evaluation-security.md)
- [Cross-Agent Compatibility](ai-skills/06-cross-agent-compatibility.md)
- [All 19 sections](ai-skills/index.md){ .kb-more }

</div>

<div class="kb-section" markdown>

### :material-cog-transfer-outline: [AI Harness](ai-harness/index.md)

Agent harness and eval harness: agent loop, context, tools, guardrails, graders, pass@k vs pass^k, eval tools, CI, Jev

- [Agent Harness — Concepts](ai-harness/01-agent-harness-concepts.md)
- [Agent Harness — Patterns](ai-harness/02-agent-harness-patterns.md)
- [Eval Harness — Concepts & Metrics](ai-harness/03-eval-harness-concepts.md)
- [Eval Harness — Tools, Testing & CI](ai-harness/04-eval-harness-tools-ci.md)
- [Building a Harness with Jev](ai-harness/05-jev-system-one-harness.md)

</div>

<div class="kb-section" markdown>

### :material-file-document-edit-outline: [Spec-Driven Development](spec-driven-development/index.md)

Specs for AI coding agents: workflow, writing specs, EARS, Spec Kit, Kiro, OpenSpec, acceptance criteria → tests

- [Concepts & Workflow](spec-driven-development/01-concepts-workflow.md)
- [Writing Good Specs](spec-driven-development/02-writing-specs.md)
- [Tools](spec-driven-development/03-tools.md)
- [QA, Testing & Best Practices](spec-driven-development/04-qa-testing-best-practices.md)

</div>

</div>

## Security

<div class="kb-sections" markdown>

<div class="kb-section" markdown>

### :material-shield-lock-outline: [Code Security](code-security/index.md)

Secrets leak prevention, dependency hardening, SAST, auth patterns, security headers, …

- [Secrets & Leak Prevention](code-security/01-secrets-leak-prevention.md)
- [Dependency Security](code-security/02-dependency-security.md)
- [Code Analysis & Secure Review](code-security/03-code-analysis-review.md)
- [Auth, Config & Security Headers](code-security/04-auth-config-headers.md)
- [CI/CD & Monitoring](code-security/05-cicd-monitoring.md)
- [Security Audit Checklist](code-security/06-security-audit-checklist.md)

</div>

<div class="kb-section" markdown>

### :material-shield-check-outline: [OWASP API Security](owasp-api-security/index.md)

API Top 10 (2023), per-risk controls, OAuth2/webhooks/gateway, testing checklist, …

- [Recommendations and Best Practices](owasp-api-security/01-owasp-api-recommendations.md)
- [OWASP API Security Testing Checklist](owasp-api-security/02-owasp-api-testing-checklist.md)
- [OWASP API Advanced Controls](owasp-api-security/03-owasp-api-advanced-controls.md)

</div>

<div class="kb-section" markdown>

### :material-shield-alert-outline: [OWASP LLM Security](owasp-llm-security/index.md)

LLM Top 10 (2026), prompt injection, output handling, agent/tool security, RAG hardening, …

- [OWASP LLM Security Guide (2026)](owasp-llm-security/01-owasp-llm-security-guide.md)
- [OWASP LLM Security Testing Checklist (2026)](owasp-llm-security/02-owasp-llm-security-testing-checklist.md)

</div>

</div>

## QA & Testing

<div class="kb-sections" markdown>

<div class="kb-section" markdown>

### :material-clipboard-check-outline: [QA & Testing Methodology](qa-methodology/index.md)

Fundamentals, test design, execution, defects, automation/SDLC, metrics, TDD/BDD, …

- [QA & Testing Fundamentals, Levels & Types](qa-methodology/01-fundamentals-levels-types.md)
- [Test Design Techniques, Test Case Design & Test Planning](qa-methodology/03-design-planning.md)
- [Test Execution, Defect Management & Environments](qa-methodology/04-execution-defects-envs.md)
- [Test Automation, SDLC, Agile & Risk-Based Testing](qa-methodology/05-automation-sdlc-agile.md)
- [Metrics, Documentation, Best Practices & QA Roles](qa-methodology/06-metrics-docs-practices-roles.md)
- [TDD, BDD & ATDD](qa-methodology/07-tdd-bdd-atdd.md)
- [All 15 sections](qa-methodology/index.md){ .kb-more }

</div>

<div class="kb-section" markdown>

### :material-table-cog: [Test Design Techniques](test-design-techniques/index.md)

EP, BVA, Decision Table, State Transition, CRUD, Metamorphic, Pairwise, Fuzz testing

- [Input Based](test-design-techniques/01-input-based/index.md)
- [Logic State Based](test-design-techniques/02-logic-state-based/index.md)
- [Experience Based](test-design-techniques/03-experience-based/index.md)

</div>

<div class="kb-section" markdown>

### :material-shape-outline: [Test Design Patterns in Test Automation](test-design-patterns/index.md)

POM, Screenplay, Data Builder, API test patterns, mocking, execution, reliability, CI/CD

- [Fundamentals](test-design-patterns/01-fundamentals/index.md)
- [Core Patterns](test-design-patterns/02-core-patterns/index.md)
- [Advanced Patterns](test-design-patterns/03-advanced-patterns/index.md)
- [API Test Patterns](test-design-patterns/04-api-test-patterns/index.md)
- [Data Mocking Env](test-design-patterns/05-data-mocking-env/index.md)
- [Execution Reliability](test-design-patterns/06-execution-reliability/index.md)
- [All 7 sections](test-design-patterns/index.md){ .kb-more }

</div>

<div class="kb-section" markdown>

### :material-triangle-outline: [Testing Pyramid](testing-pyramid/index.md)

Unit / Integration / E2E strategy, common mistakes per level, anti-patterns

- [Unit Tests](testing-pyramid/01-unit-tests/index.md)
- [Integration Tests](testing-pyramid/02-integration-tests/index.md)
- [E2E Tests](testing-pyramid/03-e2e-tests/index.md)
- [Pyramid Strategy](testing-pyramid/04-pyramid-strategy/index.md)

</div>

<div class="kb-section" markdown>

### :material-cogs: [Test Automation Framework](test-automation-framework/index.md)

Architecture, UI/API patterns, test data, parallel execution, flakiness, mocking, CI/CD

- [Architecture](test-automation-framework/01-architecture/index.md)
- [Design Patterns](test-automation-framework/02-design-patterns/index.md)
- [Test Data](test-automation-framework/03-test-data/index.md)
- [API Testing](test-automation-framework/04-api-testing/index.md)
- [UI Testing](test-automation-framework/05-ui-testing/index.md)
- [Execution Reliability](test-automation-framework/06-execution-reliability/index.md)
- [All 7 sections](test-automation-framework/index.md){ .kb-more }

</div>

<div class="kb-section" markdown>

### :material-robot-industrial-outline: [Robot Framework](robot-framework/index.md)

Syntax, keywords, API/UI testing, parallel execution, CI/CD, scalability, anti-patterns

- [Fundamentals](robot-framework/01-fundamentals/index.md)
- [Architecture](robot-framework/02-architecture/index.md)
- [API Testing](robot-framework/03-api-testing/index.md)
- [UI Testing](robot-framework/04-ui-testing/index.md)
- [Execution & Reliability](robot-framework/05-execution-reliability/index.md)
- [Infrastructure](robot-framework/06-infrastructure/index.md)
- [All 7 sections](robot-framework/index.md){ .kb-more }

</div>

<div class="kb-section" markdown>

### :material-chart-box-outline: [DeepEval — LLM Testing Guide](llm-evaluation/index.md)

DeepEval: RAG / quality / agent / chatbot / MCP metrics, conversational RAG, red teaming, …

- [DeepEval Testing Guide for QA Engineers](llm-evaluation/01_introduction.md)
- [Metrics](llm-evaluation/01_metrics/index.md)
- [Testing](llm-evaluation/02_testing/index.md)
- [Practical](llm-evaluation/03_practical/index.md)

</div>

<div class="kb-section" markdown>

### :material-speedometer: [Performance Testing](performance-testing/index.md)

Load / stress / spike / soak testing, core metrics, Locust, bottlenecks, monitoring, …

- [Fundamentals Metrics](performance-testing/01-fundamentals-metrics/index.md)
- [Locust](performance-testing/02-locust/index.md)
- [Bottlenecks Monitoring](performance-testing/03-bottlenecks-monitoring/index.md)
- [Execution Results](performance-testing/04-execution-results/index.md)

</div>

<div class="kb-section" markdown>

### :material-language-python: [Python Guide](python-guide/index.md)

Complete Python base for Automation QA: fundamentals, OOP, pytest, API/UI automation, …

- [Setup & Fundamentals](python-guide/01-setup-fundamentals/index.md)
- [OOP & Error Handling](python-guide/02-oop-error-handling/index.md)
- [Testing with pytest](python-guide/03-testing-pytest/index.md)
- [Automation](python-guide/04-automation/index.md)
- [Code Quality & CI/CD](python-guide/05-quality-cicd/index.md)
- [Advanced Topics](python-guide/06-advanced-topics/index.md)
- [All 7 sections](python-guide/index.md){ .kb-more }

</div>

<div class="kb-section" markdown>

### :material-pipe: [Jenkins Guide](jenkins-guide/index.md)

Jenkinsfile syntax, declarative vs scripted, agents, stages, credentials, parallel, …

- [Fundamentals](jenkins-guide/01-fundamentals/index.md)
- [Declarative Syntax](jenkins-guide/02-declarative-syntax/index.md)
- [Advanced Features](jenkins-guide/03-advanced-features/index.md)
- [Patterns & Best Practices](jenkins-guide/04-patterns-best-practices/index.md)

</div>

</div>

## Infrastructure & Tools

<div class="kb-sections" markdown>

<div class="kb-section" markdown>

### :material-source-branch-sync: [CI/CD](ci-cd-approaches/index.md)

Pipeline architecture, build/artifacts, testing, deployment, security, release, …

- [Fundamentals](ci-cd-approaches/01-fundamentals/index.md)
- [Build Artifacts](ci-cd-approaches/02-build-artifacts/index.md)
- [Testing](ci-cd-approaches/03-testing/index.md)
- [Deployment](ci-cd-approaches/04-deployment/index.md)
- [Security Observability](ci-cd-approaches/05-security-observability/index.md)
- [Release Production](ci-cd-approaches/06-release-production/index.md)
- [All 7 sections](ci-cd-approaches/index.md){ .kb-more }

</div>

<div class="kb-section" markdown>

### :material-database-outline: [Databases](databases/index.md)

Database types and selection guide, PostgreSQL: commands, schema, queries, performance, …

- [PostgreSQL](databases/postgresql/index.md)

</div>

<div class="kb-section" markdown>

### :material-tools: [Tools](tools/index.md)

Docker, Git, Linux Terminal, Kubernetes — commands, best practices, troubleshooting

- [Docker & Docker Compose](tools/docker/index.md)
- [Git](tools/git/index.md)
- [Linux Terminal](tools/linux-terminal/index.md)
- [Kubernetes](tools/kubernetes/index.md)

</div>

<div class="kb-section" markdown>

### :material-package-variant-closed: [Python Libraries](libs/index.md)

Requests, HTTPX, Pytest, Playwright, Pydantic, SQLAlchemy, FastAPI, uv, LangChain, …

- [Code Quality](libs/code-quality/index.md)
- [FastAPI](libs/fastapi/index.md)
- [HTTPX](libs/httpx/index.md)
- [LangChain](libs/langchain/index.md)
- [Playwright](libs/playwright/index.md)
- [Pydantic](libs/pydantic/index.md)
- [All 10 sections](libs/index.md){ .kb-more }

</div>

</div>
