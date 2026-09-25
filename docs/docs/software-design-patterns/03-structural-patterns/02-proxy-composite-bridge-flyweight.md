---
date: 2026-06-17
tags:
  - design-patterns
  - architecture
---

# Structural Patterns: Proxy, Composite, Bridge, Flyweight

## Proxy

Controls access to another object. Used for: lazy initialization, access control, caching, logging.

```python
from typing import Protocol

class ImageLoader(Protocol):
    def display(self) -> None: ...

class RealImage:
    def __init__(self, filename: str) -> None:
        self._filename = filename
        self._load()

    def _load(self) -> None:
        print(f"Loading {self._filename} from disk...")

    def display(self) -> None:
        print(f"Displaying {self._filename}")

class LazyImageProxy:
    """Loads image only when display() is first called."""
    def __init__(self, filename: str) -> None:
        self._filename = filename
        self._real: RealImage | None = None

    def display(self) -> None:
        if self._real is None:
            self._real = RealImage(self._filename)
        self._real.display()
```

Types of proxy:
- **Virtual (lazy):** defer expensive creation until needed.
- **Protection:** check permissions before forwarding.
- **Remote:** represents object in another process or network.
- **Caching:** store result on first call, return cached on subsequent.

## Composite

Treat individual objects and groups of objects uniformly. Used for tree structures.

```python
from abc import ABC, abstractmethod

class FileSystemItem(ABC):
    @abstractmethod
    def size(self) -> int: ...

class File(FileSystemItem):
    def __init__(self, name: str, size_bytes: int) -> None:
        self.name = name
        self._size = size_bytes

    def size(self) -> int:
        return self._size

class Directory(FileSystemItem):
    def __init__(self, name: str) -> None:
        self.name = name
        self._children: list[FileSystemItem] = []

    def add(self, item: FileSystemItem) -> None:
        self._children.append(item)

    def size(self) -> int:
        return sum(child.size() for child in self._children)

root = Directory("root")
root.add(File("readme.md", 1024))
docs = Directory("docs")
docs.add(File("guide.pdf", 204800))
root.add(docs)
print(root.size())  # 205824
```

## Bridge

Separate abstraction from implementation so they can vary independently.

```python
from abc import ABC, abstractmethod

class Renderer(ABC):
    @abstractmethod
    def render_circle(self, radius: float) -> str: ...

class SVGRenderer(Renderer):
    def render_circle(self, radius: float) -> str:
        return f"<circle r='{radius}'/>"

class CanvasRenderer(Renderer):
    def render_circle(self, radius: float) -> str:
        return f"ctx.arc(0,0,{radius},0,2*Math.PI)"

class Shape(ABC):
    def __init__(self, renderer: Renderer) -> None:
        self._renderer = renderer

class Circle(Shape):
    def __init__(self, radius: float, renderer: Renderer) -> None:
        super().__init__(renderer)
        self._radius = radius

    def draw(self) -> str:
        return self._renderer.render_circle(self._radius)
```

Use when: you have two independent dimensions of variation (shape type × renderer type). Avoids a class explosion.

## Flyweight

Share common state between many objects to reduce memory use.

```python
class GlyphStyle:
    """Shared, immutable glyph style — stored once per unique style."""
    def __init__(self, font: str, size: int, color: str) -> None:
        self.font = font
        self.size = size
        self.color = color

class GlyphStyleFactory:
    _cache: dict[tuple, GlyphStyle] = {}

    @classmethod
    def get(cls, font: str, size: int, color: str) -> GlyphStyle:
        key = (font, size, color)
        if key not in cls._cache:
            cls._cache[key] = GlyphStyle(font, size, color)
        return cls._cache[key]

# 10 000 characters may share 3 style objects instead of creating 10 000
```

Use when: you have a large number of objects that share most of their state. Only the unique (extrinsic) state differs per instance.

## Structural Pattern Risks

| Pattern | Risk |
|---|---|
| Adapter | Can mask fundamental API mismatch — adapter may need to be thick |
| Decorator | Many decorators make call stack hard to trace |
| Facade | Can become God Object if too many responsibilities added over time |
| Proxy | Extra layer adds latency; transparent-to-caller assumption can break |
| Composite | Uniform interface forces lowest common denominator |
| Bridge | Adds indirection; overkill for simple cases |
| Flyweight | Complexity of separating intrinsic/extrinsic state; not thread-safe without care |
