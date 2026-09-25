---
date: 2026-08-04
tags:
  - llm
  - evaluation
  - deepeval
  - metrics
---

# DeepEval Guide — Part 8: Multimodal (Image) Metrics

## What Are Multimodal Metrics?

These metrics evaluate LLM systems that work with IMAGES — not just text.
They use a multimodal judge (like GPT-4o) that can see images.

To use these metrics, you need:
- A multimodal LLM as judge (e.g., `gpt-4o`)
- `MLLMImage` objects to represent images in test cases
- `multimodal=True` on your `LLMTestCase`

**Important:** `input`, `actual_output`, and `expected_output` must remain
**strings**. You embed images by using f-strings: `f"text {img}"`.
`MLLMImage.__str__()` returns a special placeholder token that DeepEval
parses internally to extract the images.

---

## MLLMImage — How to Pass Images

```python
from deepeval.test_case import MLLMImage

# From URL
img_url = MLLMImage(url="https://example.com/photo.png")

# From local file
img_local = MLLMImage(url="./images/photo.png", local=True)

# From base64
img_b64 = MLLMImage(dataBase64="iVBORw0KGgo...", mimeType="image/png")

# Embed into a string field (input, actual_output, expected_output):
text_with_image = f"Here is the result: {img_url}"
# Produces: "Here is the result: [DEEPEVAL:IMAGE:<id>]"
```

---

## Metric 1: Image Coherence

**What it checks:** Is the generated image internally consistent and logical?

**How it works:** The judge looks at the image and checks if it makes visual
sense — no distorted faces, impossible physics, or broken objects.

```python
from deepeval import assert_test
from deepeval.metrics import ImageCoherenceMetric
from deepeval.test_case import LLMTestCase, MLLMImage

def test_image_coherence():
    """generated image is visually coherent."""
    cat_img = MLLMImage(url="https://example.com/cat.png")
    test_case = LLMTestCase(
        input="Generate a photo of a cat sitting on a sofa.",
        actual_output=f"{cat_img}",
        multimodal=True,
    )
    metric = ImageCoherenceMetric(threshold=0.7)
    assert_test(test_case, [metric])
```

---

## Metric 2: Image Editing

**What it checks:** Did the image editing follow the instructions?

```python
from deepeval import assert_test
from deepeval.metrics import ImageEditingMetric
from deepeval.test_case import LLMTestCase, MLLMImage

def test_image_editing():
    """image was edited according to instructions."""
    original = MLLMImage(url="https://example.com/original.png")
    edited = MLLMImage(url="https://example.com/edited.png")
    test_case = LLMTestCase(
        input=f"Make the sky blue in this image. {original}",
        actual_output=f"{edited}",
        multimodal=True,
    )
    metric = ImageEditingMetric(threshold=0.7)
    assert_test(test_case, [metric])
```

---

## Metric 3: Image Helpfulness

**What it checks:** Is the image helpful for answering the user's question?

```python
from deepeval import assert_test
from deepeval.metrics import ImageHelpfulnessMetric
from deepeval.test_case import LLMTestCase, MLLMImage

def test_image_helpfulness():
    """diagram helps explain the architecture."""
    diagram = MLLMImage(url="https://example.com/diagram.png")
    test_case = LLMTestCase(
        input="Show me a microservices architecture diagram.",
        actual_output=f"Here is the architecture diagram: {diagram}",
        multimodal=True,
    )
    metric = ImageHelpfulnessMetric(threshold=0.7)
    assert_test(test_case, [metric])
```

---

## Metric 4: Image Reference

**What it checks:** Does the generated image match a reference image?

```python
from deepeval import assert_test
from deepeval.metrics import ImageReferenceMetric
from deepeval.test_case import LLMTestCase, MLLMImage

def test_image_reference():
    """generated logo matches the reference design."""
    generated = MLLMImage(url="https://example.com/gen.png")
    reference = MLLMImage(url="https://example.com/ref.png")
    test_case = LLMTestCase(
        input="Generate a company logo with a blue circle.",
        actual_output=f"{generated}",
        expected_output=f"{reference}",
        multimodal=True,
    )
    metric = ImageReferenceMetric(threshold=0.7)
    assert_test(test_case, [metric])
```

---

## Metric 5: Text to Image

**What it checks:** Does the generated image match the text description?

```python
from deepeval import assert_test
from deepeval.metrics import TextToImageMetric
from deepeval.test_case import LLMTestCase, MLLMImage

def test_text_to_image():
    """image matches the text description."""
    dog_img = MLLMImage(url="https://example.com/dog.png")
    test_case = LLMTestCase(
        input="A golden retriever playing in the snow.",
        actual_output=f"{dog_img}",
        multimodal=True,
    )
    metric = TextToImageMetric(threshold=0.7)
    assert_test(test_case, [metric])
```

---

## Multimodal Metrics Summary

| Metric | What It Checks | Good Score |
|--------|---------------|------------|
| ImageCoherence | Is image visually consistent? | High = good |
| ImageEditing | Was edit instruction followed? | High = good |
| ImageHelpfulness | Does image help the user? | High = good |
| ImageReference | Does image match reference? | High = good |
| TextToImage | Does image match text prompt? | High = good |

### Key Notes for QA

1. All multimodal metrics need a vision-capable judge (GPT-4o)
2. Use `MLLMImage` to pass images via URL, local path, or base64
3. Set `multimodal=True` on `LLMTestCase`
4. `input`/`actual_output`/`expected_output` must be **strings** — embed
   images via f-strings: `f"text {img}"`
5. Useful for AI image generators, editing tools, multimodal chatbots

### Sources

- [DeepEval Multimodal Docs](https://deepeval.com/docs/metrics-image-coherence)
- [DeepEval MLLMImage](https://deepeval.com/docs/evaluation-test-cases-mllm)
