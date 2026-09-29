---
date: 2026-09-03
tags:
  - tools
---

# Tools — Practical Reference Guides

Hands-on command references, configuration patterns, and best practices for the tools a software engineer uses daily.

## Docker & Docker Compose

| Resource | Topics |
|------|--------|
| [Overview](./docker/index.md) | Architecture, lifecycle, ecosystem, when to containerize |
| [Commands & Fundamentals](./docker/01-commands-fundamentals.md) | Image/container lifecycle, exec, logs, inspect, system cleanup |
| [Dockerfile Best Practices](./docker/02-dockerfile-best-practices.md) | Multi-stage builds, layer caching, base images, ARG/ENV, `.dockerignore` |
| [Docker Compose](./docker/03-docker-compose.md) | Service definitions, profiles, overrides, depends_on, healthchecks |
| [Networking & Volumes](./docker/04-networking-volumes.md) | Bridge/host/overlay networks, DNS, named volumes, bind mounts, tmpfs |
| [Security & Production](./docker/05-security-production.md) | Non-root, secrets, resource limits, image scanning, production checklist |
| [Debugging & Troubleshooting](./docker/06-debugging-troubleshooting.md) | Connectivity tests, log analysis, netshoot, compose diagnostics |

## Git

| Resource | Topics |
|------|--------|
| [Overview](./git/index.md) | Object model, three-area workflow, distributed architecture |
| [Commands & Fundamentals](./git/01-commands-fundamentals.md) | Init, add, commit, push, pull, log, diff, tags, cleanup |
| [Branching Strategies](./git/02-branching-strategies.md) | GitHub Flow, Gitflow, Trunk-Based, merge vs rebase vs squash |
| [Commit Conventions](./git/03-commit-conventions.md) | Conventional Commits, message rules, PR best practices, code review |
| [Advanced Workflows](./git/04-advanced-workflows.md) | Interactive rebase, stash, cherry-pick, worktree, submodules |
| [Hooks & Configuration](./git/05-hooks-configuration.md) | Pre-commit framework, native hooks, .gitignore, aliases, global config |
| [Troubleshooting & Recovery](./git/06-troubleshooting-recovery.md) | Undo, reset, reflog, bisect, conflict resolution |

## Linux Terminal

| Resource | Topics |
|------|--------|
| [Overview](./linux-terminal/index.md) | Essential Linux terminal commands for daily user tasks |
| [Navigation & File Operations](./linux-terminal/01-navigation-files.md) | `pwd`, `ls`, `cd`, `mkdir`, `cp`, `mv`, `rm`, `cat`, `nano`, `sudo`, `chmod`, `tar` |
| [Search & Text Processing](./linux-terminal/02-search-text-processing.md) | `find`, `grep`, `rg`, `sort`, `uniq`, `wc`, pipes, redirects |
| [Processes & System Monitoring](./linux-terminal/03-processes-system-monitoring.md) | `ps`, `top`, `kill`, `systemctl`, `journalctl`, `free`, `df` |
| [Network Basics](./linux-terminal/04-network-ssh-downloads.md) | `ip`, `ss`, `ping`, `curl`, `wget`, `ssh`, `scp`, `netstat` (legacy) |
| [Administration & Scripting](./linux-terminal/05-admin-scripting.md) | `apt`, user/group mgmt, `.bashrc`, bash scripting, `cal`, `date` |

## Kubernetes (K8s)

| Resource | Topics |
|------|--------|
| [Overview](./kubernetes/index.md) | Architecture, control plane, nodes, Pods, quick reference |
| [kubectl Fundamentals](./kubernetes/01-kubectl-fundamentals.md) | Commands, contexts, namespaces, output formats, aliases |
| [Workloads & Scheduling](./kubernetes/02-workloads-scheduling.md) | Pods, Deployments, StatefulSets, DaemonSets, Jobs, CronJobs |
| [Services & Networking](./kubernetes/03-services-networking.md) | ClusterIP, NodePort, LoadBalancer, Ingress, NetworkPolicies |
| [Configuration & Storage](./kubernetes/04-config-storage.md) | ConfigMaps, Secrets, PVs, PVCs, StorageClasses |
| [Helm & Deployment Strategies](./kubernetes/05-helm-deployments.md) | Helm charts, Kustomize, rolling update, canary, blue-green |
| [Security & Observability](./kubernetes/06-security-observability.md) | RBAC, Pod Security, Prometheus, Grafana, EFK, debugging |

## Distributed Tracing

| Resource | Topics |
|------|--------|
| [Jaeger — Overview](./jaeger/index.md) | OTLP tracing backend, ports, Jaeger vs Phoenix / Langfuse / Tempo |
| [Setup & Architecture](./jaeger/01-setup-architecture.md) | v2 on the OTel Collector, roles, Docker, config file, memory / Badger / Elasticsearch / OpenSearch / Cassandra |
| [Sending Traces from Python](./jaeger/02-sending-traces-python.md) | OTel SDK + OTLP exporter, FastAPI and requests instrumentation, env vars, sampling |
| [UI & Trace Analysis](./jaeger/03-ui-trace-analysis.md) | Search, timeline, span details, compare traces, dependency graph, SPM, HTTP API |
| [Testing, CI & Troubleshooting](./jaeger/04-testing-ci-troubleshooting.md) | Tracing pytest runs, `traceparent` from API tests, span assertions, CI artifacts, pitfalls |

## LLM Observability & Tracing

| Resource | Topics |
|------|--------|
| [Arize Phoenix — Overview](./phoenix/index.md) | OpenTelemetry + OpenInference tracing, datasets, experiments, LLM-as-judge evals |
| [Setup & Architecture](./phoenix/01-setup-architecture.md) | `phoenix serve`, Docker, Compose + Postgres, ports, projects, auth, env vars |
| [Tracing & Instrumentation](./phoenix/02-tracing-instrumentation.md) | `register()`, OpenInference instrumentors, manual spans, sessions, users, Collector, annotations |
| [Datasets & Experiments](./phoenix/03-datasets-experiments.md) | Datasets from DataFrame / CSV / traces, `run_experiment`, evaluators, comparisons, prompts |
| [Evaluations](./phoenix/04-evaluations.md) | `phoenix.evals`, built-in metrics, `create_classifier`, code evals, logging results to spans, judge calibration |
| [Testing, CI & Production](./phoenix/05-testing-ci-production.md) | pytest plugin, asserting on spans, CI regression gates, retention, sampling, PII |

| Resource | Topics |
|------|--------|
| [Langfuse — Overview](./langfuse/index.md) | Traces, sessions, prompt management, datasets, scores and evaluations |
| [Setup & Architecture](./langfuse/01-setup-architecture.md) | Cloud vs self-hosted, web/worker/Postgres/ClickHouse/Redis/S3, Docker Compose, env vars, projects, API keys, RBAC |
| [Tracing with the Python SDK](./langfuse/02-tracing-sdk.md) | `get_client()`, `@observe`, context managers, `propagate_attributes`, OpenAI/LangChain/LiteLLM/OTel, flushing, sampling, masking |
| [Prompt Management](./langfuse/03-prompt-management.md) | Versions, labels, `get_prompt`, `compile`, caching, fallback, linking prompts to generations, prompt experiments |
| [Datasets & Evaluations](./langfuse/04-datasets-evaluations.md) | Datasets from code and traces, `run_experiment`, evaluators, scores, LLM-as-a-judge, annotation queues, user feedback |
| [Testing, CI & Production](./langfuse/05-testing-ci-production.md) | pytest integration, experiments as CI gates, Metrics API, dashboards, retention, PII, production checklist |

| Resource | Topics |
|------|--------|
| [MLflow — Overview](./mlflow/index.md) | Experiment tracking, GenAI tracing, `mlflow.genai.evaluate`, prompt and model registry, MLflow vs Phoenix / Langfuse / Jaeger |
| [Setup & Architecture](./mlflow/01-setup-architecture.md) | `mlflow server`, backend and artifact stores, Docker Compose + Postgres, allowed hosts, basic auth, env vars |
| [Experiment Tracking](./mlflow/02-experiment-tracking.md) | Experiments, runs, params, metrics, tags, artifacts, autolog, `search_runs` filters, comparing runs |
| [GenAI Tracing](./mlflow/03-genai-tracing.md) | `mlflow.<flavor>.autolog()`, `@mlflow.trace`, span types, sessions, feedback, OTLP ingest and export |
| [Evaluation & Prompts](./mlflow/04-evaluation-prompts.md) | Built-in judges, `@scorer`, `make_judge`, DeepEval scorers, evaluation datasets, prompt registry |
| [Testing, CI & Model Registry](./mlflow/05-testing-ci-registry.md) | pytest + DeepEval results per CI run, trace assertions, regression gate vs `main`, GitHub Actions, aliases, pitfalls |

---
## See also
- [Digital Garden: Knowledge Base](../index.md)
- [CI/CD](../ci-cd-approaches/index.md)
- [Test Automation Framework](../test-automation-framework/index.md)
- [Code Quality & CI/CD](../python-guide/05-quality-cicd/index.md)
- [uv — Fast Python Project Manager](../libs/uv/index.md)
- [OpenTelemetry](../libs/opentelemetry/index.md)
- [LiteLLM](../libs/litellm/index.md)
