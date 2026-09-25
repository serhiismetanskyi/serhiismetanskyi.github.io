---
date: 2026-08-16
tags:
  - python
---

# Files & Data Formats

Python makes it easy to read and write files. This page covers text files, JSON, and CSV.

---

## Reading and Writing Text Files

### Reading a File

```python
from pathlib import Path

content = Path("data.txt").read_text(encoding="utf-8")
print(content)
```

### Writing a File

```python
from pathlib import Path

Path("output.txt").write_text("Hello, World!", encoding="utf-8")
```

### Using Context Manager (Traditional Way)

```python
with open("data.txt", "r", encoding="utf-8") as f:
    content = f.read()

with open("output.txt", "w", encoding="utf-8") as f:
    f.write("Hello, World!")
```

!!! tip "Always use context managers"
    The `with` statement automatically closes the file, even if an error happens.

---

## File Modes

| Mode | Meaning |
|------|---------|
| `"r"` | Read (default) |
| `"w"` | Write (overwrites file) |
| `"a"` | Append (adds to end) |
| `"x"` | Create (fails if file exists) |
| `"rb"` | Read binary |
| `"wb"` | Write binary |

---

## Working with Paths

Use `pathlib` — it is the modern way to work with file paths:

```python
from pathlib import Path

project_dir = Path("project")
config_file = project_dir / "config" / "settings.json"

print(config_file.exists())    # True/False
print(config_file.name)        # "settings.json"
print(config_file.suffix)      # ".json"
print(config_file.parent)      # project/config
print(config_file.is_file())   # True/False
```

### List Files in a Directory

```python
from pathlib import Path

for file in Path("tests").glob("*.py"):
    print(file.name)

for file in Path("project").rglob("*.py"):
    print(file)  # recursive search
```

---

## JSON

JSON is the most common data format for APIs and configuration.

### Reading JSON

```python
import json
from pathlib import Path

data = json.loads(Path("data.json").read_text(encoding="utf-8"))
print(data["name"])
```

### Writing JSON

```python
import json
from pathlib import Path

data = {"name": "Alice", "scores": [90, 85, 92]}
Path("output.json").write_text(
    json.dumps(data, indent=2, ensure_ascii=False),
    encoding="utf-8",
)
```

### JSON with Custom Types

```python
import json
from datetime import datetime

def json_serializer(obj):
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Type {type(obj)} is not serializable")

data = {"timestamp": datetime.now()}
json_text = json.dumps(data, default=json_serializer)
```

---

## CSV

CSV files store tabular data (rows and columns).

### Reading CSV

```python
import csv
from pathlib import Path

with Path("users.csv").open(encoding="utf-8") as f:
    reader = csv.DictReader(f)
    for row in reader:
        print(row["name"], row["email"])
```

### Writing CSV

```python
import csv
from pathlib import Path

users = [
    {"name": "Alice", "email": "alice@example.com"},
    {"name": "Bob", "email": "bob@example.com"},
]

with Path("output.csv").open("w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=["name", "email"])
    writer.writeheader()
    writer.writerows(users)
```

---

## YAML

YAML is used for configuration files. It is more readable than JSON for complex settings.

### Install

```bash
uv add pyyaml
```

### Reading YAML

```python
import yaml
from pathlib import Path

data = yaml.safe_load(Path("config.yaml").read_text(encoding="utf-8"))
print(data["database"]["host"])
```

### Writing YAML

```python
import yaml
from pathlib import Path

config = {
    "database": {
        "host": "localhost",
        "port": 5432,
        "name": "testdb",
    },
    "debug": True,
}
Path("config.yaml").write_text(
    yaml.dump(config, default_flow_style=False),
    encoding="utf-8",
)
```

### Example YAML File

```yaml
database:
  host: localhost
  port: 5432
  name: testdb

api:
  base_url: https://api.example.com
  timeout: 30

debug: true
```

!!! tip "Always use `yaml.safe_load()`"
    Never use `yaml.load()` — it can execute arbitrary Python code. Use `yaml.safe_load()` instead.

---

## Format Comparison

| Format | Best For | Human Readable | Comments |
|--------|---------|----------------|---------|
| JSON | API responses, data exchange | Medium | No |
| CSV | Tabular data, spreadsheets | Yes | No |
| YAML | Configuration files | Yes | Yes |

---

## Best Practices

- **Always** specify `encoding="utf-8"` when opening files
- **Always** use `with` (context managers) for file operations
- Use **`pathlib.Path`** instead of `os.path` for path handling
- **Validate** data from external files before using it
- Handle **`FileNotFoundError`** when reading files
- Use **`json.dumps(indent=2)`** for readable output
- Never **hardcode** file paths — use configuration or parameters
