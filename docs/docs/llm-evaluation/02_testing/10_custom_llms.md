---
date: 2026-08-05
tags:
  - llm
  - evaluation
  - deepeval
---

# DeepEval Guide — Part 10: Custom LLMs and Embedding Models

## Why Use Custom Models?

By default, DeepEval uses OpenAI GPT models as the judge LLM. But you can
use **any** LLM: Azure OpenAI, Gemini, Claude, Llama, Mistral, or local
models via Ollama, vLLM, LM Studio.

---

## Creating a Custom LLM (DeepEvalBaseLLM)

Inherit `DeepEvalBaseLLM` and implement 4 methods:

```python
from deepeval.models import DeepEvalBaseLLM

class CustomLLM(DeepEvalBaseLLM):
    def load_model(self):
        """Return your model object."""
        return my_model_instance

    def generate(self, prompt: str) -> str:
        """Generate a response from a text prompt."""
        model = self.load_model()
        return model.invoke(prompt)

    async def a_generate(self, prompt: str) -> str:
        """Async version of generate. Reuse sync if no async API."""
        return self.generate(prompt)

    def get_model_name(self) -> str:
        return "My Custom Model"
```

Use it in any metric:

```python
from deepeval.metrics import AnswerRelevancyMetric

custom_llm = CustomLLM()
metric = AnswerRelevancyMetric(model=custom_llm)
```

---

## Azure OpenAI Example

```python
from langchain_openai import AzureChatOpenAI
from deepeval.models import DeepEvalBaseLLM

class AzureOpenAI(DeepEvalBaseLLM):
    def __init__(self, model):
        self.model = model

    def load_model(self):
        return self.model

    def generate(self, prompt: str) -> str:
        return self.load_model().invoke(prompt).content

    async def a_generate(self, prompt: str) -> str:
        res = await self.load_model().ainvoke(prompt)
        return res.content

    def get_model_name(self) -> str:
        return "Azure OpenAI"

custom_model = AzureChatOpenAI(
    openai_api_version="2024-02-15-preview",
    azure_deployment="my-deployment",
    azure_endpoint="https://my-resource.openai.azure.com/",
    openai_api_key="your-key",
)
azure_llm = AzureOpenAI(model=custom_model)
```

---

## CLI Shortcuts for Common Providers

```bash
# Azure OpenAI
deepeval set-azure-openai --base-url=<url> --model=<name> \
    --deployment-name=<name> --api-version=<ver>

# Ollama (local)
deepeval set-ollama --model=<name>
deepeval unset-ollama  # revert to OpenAI

# Local model (vLLM, LM Studio)
deepeval set-local-model --model=<name> \
    --base-url="http://localhost:8000/v1/"
```

---

## JSON Confinement for Custom LLMs

Smaller LLMs may fail to produce valid JSON. DeepEval supports
a `schema` parameter in `generate()` for JSON confinement:

```python
import json
from typing import Type
from pydantic import BaseModel
from deepeval.models import DeepEvalBaseLLM

class ConfinedLLM(DeepEvalBaseLLM):
    def generate(self, prompt: str, schema: Type[BaseModel]) -> BaseModel:
        """Accept a Pydantic schema class, return a valid instance."""
        # Use lm-format-enforcer or instructor library
        # to enforce JSON output matching the schema
        raw_output = self._call_llm(prompt)
        json_result = json.loads(raw_output)
        return schema(**json_result)

    async def a_generate(
        self, prompt: str, schema: Type[BaseModel],
    ) -> BaseModel:
        return self.generate(prompt, schema)
```

**Libraries for JSON confinement:**

| Library | Best For |
|---------|---------|
| `lm-format-enforcer` | HuggingFace transformers, vLLM, llama.cpp |
| `instructor` | API-based models (Gemini, Claude, OpenAI) |

---

## Custom Embedding Models

Only needed for `Synthesizer.generate_goldens_from_docs()`.
Inherit `DeepEvalBaseEmbeddingModel`:

```python
from typing import List
from deepeval.models import DeepEvalBaseEmbeddingModel

class CustomEmbedder(DeepEvalBaseEmbeddingModel):
    def load_model(self):
        return my_embedding_model

    def embed_text(self, text: str) -> List[float]:
        return self.load_model().embed_query(text)

    def embed_texts(self, texts: List[str]) -> List[List[float]]:
        return self.load_model().embed_documents(texts)

    async def a_embed_text(self, text: str) -> List[float]:
        return self.embed_text(text)

    async def a_embed_texts(self, texts: List[str]) -> List[List[float]]:
        return self.embed_texts(texts)

    def get_model_name(self):
        return "Custom Embedder"
```

Use it:

```python
from deepeval.synthesizer import Synthesizer
from deepeval.synthesizer.config import ContextConstructionConfig

synthesizer = Synthesizer()
synthesizer.generate_goldens_from_docs(
    context_construction_config=ContextConstructionConfig(
        embedder=CustomEmbedder()
    )
)
```

### CLI Shortcuts for Embedding Models

```bash
# Azure OpenAI embeddings
deepeval set-azure-openai-embedding --deployment-name=<name>

# Ollama embeddings
deepeval set-ollama-embeddings --model=<name>
deepeval unset-ollama-embeddings  # revert

# Local embeddings (vLLM, LM Studio)
deepeval set-local-embeddings --model=<name> \
    --base-url="http://localhost:1234/v1/"
```

### Sources

- [Custom LLMs Guide](https://deepeval.com/guides/guides-using-custom-llms)
- [Custom Embeddings Guide](https://deepeval.com/guides/guides-using-custom-embedding-models)
