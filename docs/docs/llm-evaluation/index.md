---
date: 2026-08-02
tags:
  - llm
  - evaluation
  - deepeval
---

# DeepEval — LLM Testing Guide

A complete reference for testing LLM systems with DeepEval (v3.8+).
Covers all metric categories, custom models and metrics, automated workflows,
benchmarks, and production evaluation patterns.

---

## Contents

| File | Part | Topics |
|------|------|--------|
| [Introduction](01_introduction.md) | 1 | What is DeepEval, LLM-as-Judge, key concepts, setup, all 47+ metrics by category |

### [Metrics](01_metrics/index.md)

| File | Part | Topics |
|------|------|--------|
| [RAG Metrics](01_metrics/02_rag_metrics.md) | 2 | AnswerRelevancy, Faithfulness, ContextualPrecision, ContextualRecall, ContextualRelevancy, RAG Triad |
| [LLM Quality Metrics](01_metrics/03_llm_quality_metrics.md) | 3 | Hallucination, Toxicity, Bias, Summarization, GEval, PII Leakage, Misuse, NonAdvice, RoleViolation |
| [AI Agent Metrics](01_metrics/04_agent_metrics.md) | 4 | ToolCorrectness, TaskCompletion, GoalAccuracy, ToolUse, PlanQuality, PlanAdherence, StepEfficiency, ArgumentCorrectness |
| [Chatbot Metrics](01_metrics/05_chatbot_metrics.md) | 5 | KnowledgeRetention, ConversationCompleteness, RoleAdherence, TopicAdherence, ConversationSimulator |
| [MCP Metrics](01_metrics/06_mcp_metrics.md) | 6 | MCPUse, MCPTaskCompletion, MultiTurnMCPUse, MCP test case fields |
| [Extra Metrics](01_metrics/07_extra_metrics.md) | 7 | ExactMatch, JsonCorrectness, PatternMatch, PromptAlignment, ConversationalGEval, ArenaGEval, DAGMetric, Turn-Level RAG |
| [Multimodal Metrics](01_metrics/08_multimodal_metrics.md) | 8 | ImageCoherence, ImageEditing, ImageHelpfulness, ImageReference, TextToImage, MLLMImage |

### Testing & Customisation

| File | Part | Topics |
|------|------|--------|
| [Red Teaming](02_testing/09_red_teaming.md) | 9 | RedTeamer, vulnerability scanning, attack enhancements, DeepTeam |
| [Custom LLMs](02_testing/10_custom_llms.md) | 10 | DeepEvalBaseLLM, Azure/Ollama/local models, JSON confinement, custom embeddings |
| [Custom Metrics](02_testing/11_custom_metrics.md) | 11 | BaseMetric interface, ROUGE metric, composite metrics, Answer Correctness, threshold calibration |
| [Testing Workflows](02_testing/12_testing_workflows.md) | 12 | Synthesizer, CI/CD regression, hyperparameter tracking, LLM tracing, Confident AI |
| [LLM Benchmarks](02_testing/13_benchmarks.md) | 13 | MMLU, HellaSwag, BIG-Bench Hard, HumanEval, TruthfulQA, GSM8K and 11 more |
| [Conversational RAG Evaluation](02_testing/14_conversational_rag_evaluation.md) | 14b | History management, controlled vs live RAG, failure mode design, metric divergence |

### Practical Guides

| File | Part | Topics |
|------|------|--------|
| [Practical RAG Testing](03_practical/14_practical_rag_testing.md) | 14 | LangChain + Ollama + Chroma pipeline, execution vs judge separation, full E2E walkthrough |
| [RAG Diagnostic Testing](03_practical/15_rag_diagnostic_testing.md) | 15 | Baseline → parameter tuning → query-type analysis → cross-document testing |
| [Datasets & Goldens](03_practical/16_datasets.md) | 16 | Golden vs TestCase, CSV/JSON save-load, all 4 Synthesizer methods, curation best practices |
| [Prompts & Optimization](03_practical/17_prompts_optimization.md) | 17 | Prompt class, GEPA, MIPROv2, COPRO algorithms, prompt versioning |
| [Configs, Flags & Reference](03_practical/18_configs_flags_reference.md) | 18 | AsyncConfig, DisplayConfig, ErrorConfig, CacheConfig, CLI flags, env vars, RAGAS |
| [Reference Appendix](03_practical/19_reference_appendix.md) | 19 | DeepTeam migration, vulnerability classes, Arena test cases, troubleshooting |
| [E2E Complex Tests](03_practical/20_e2e_complex_tests.md) | 20 | ConversationalTestCase with RAG + tools + multiple metrics, scenario checklist |

---

## Quick reference

| Task | Where to start |
|------|---------------|
| Test a RAG pipeline | [Part 2](01_metrics/02_rag_metrics.md) → [Part 14](03_practical/14_practical_rag_testing.md) |
| Test an AI agent | [Part 4](01_metrics/04_agent_metrics.md) → [Part 20](03_practical/20_e2e_complex_tests.md) |
| Test a chatbot | [Part 5](01_metrics/05_chatbot_metrics.md) → [Part 20](03_practical/20_e2e_complex_tests.md) |
| Run security scan | [Part 9](02_testing/09_red_teaming.md) |
| Use a local/custom LLM | [Part 10](02_testing/10_custom_llms.md) → [Part 14](03_practical/14_practical_rag_testing.md) |
| Build a custom metric | [Part 11](02_testing/11_custom_metrics.md) |
| Set up CI/CD | [Part 12](02_testing/12_testing_workflows.md) |
| Benchmark an LLM | [Part 13](02_testing/13_benchmarks.md) |
| Fix low RAG scores | [Part 15](03_practical/15_rag_diagnostic_testing.md) |
| Evaluate multi-turn RAG | [Part 5](01_metrics/05_chatbot_metrics.md) → [Part 14b](02_testing/14_conversational_rag_evaluation.md) |

---

## Related sections

- [QA Methodology](../qa-methodology/index.md) — QA fundamentals, test design, defect management, Agile QA
- [Test Design Techniques](../test-design-techniques/index.md) — black-box, white-box, experience-based methods
- [Testing Pyramid](../testing-pyramid/index.md) — unit, integration, E2E strategy in practice
- [Test Automation Framework](../test-automation-framework/index.md) — framework design, config, CI integration
- [CI/CD Approaches](../ci-cd-approaches/index.md) — quality gates, pipeline testing strategy

## Sections

- [Testing](02_testing/index.md)
- [Practical](03_practical/index.md)

---
## See also
- [Digital Garden: Knowledge Base](../index.md)
- [Agentic AI Architecture](../agentic-ai-architecture/index.md)
- [OWASP LLM Security](../owasp-llm-security/index.md)
- [LangChain — LLM Application Framework](../libs/langchain/index.md)
- [QA & Testing Methodology](../qa-methodology/index.md)

