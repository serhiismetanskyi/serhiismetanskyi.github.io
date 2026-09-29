# serhiismetanskyi.github.io

Personal site of **Serhii Smetanskyi**, Software Test & Automation Engineer: a blog, a knowledge base on QA,
test automation and testing AI systems, open-source projects and a CV.

**→ [serhiismetanskyi.github.io](https://serhiismetanskyi.github.io/)**

## What's inside

| Section | |
|---|---|
| [Blog](https://serhiismetanskyi.github.io/blog/) | Posts on LLM evaluation, voice AI agents, test design, automation |
| [Docs](https://serhiismetanskyi.github.io/docs/) | Guides: test automation, API and performance testing, LLM security, Python libraries, observability tools |
| [Projects](https://serhiismetanskyi.github.io/projects/) | Test suites on GitHub: AI, UI, API, load and database testing |
| [CV](https://serhiismetanskyi.github.io/cv/) | Experience and skills, printable to PDF |

## Stack

[Zensical](https://zensical.org) · Markdown + Jinja templates · plain JS and CSS · [uv](https://docs.astral.sh/uv/) ·
Docker · GitHub Actions → GitHub Pages

## Local development

```bash
make install   # uv sync: Zensical and linters from uv.lock
make serve     # dev server at http://localhost:8000
make up        # the same in Docker
make check     # linters + strict build, as in CI
make hooks     # install pre-commit hooks
```

`make help` lists every command.

## Layout

```
docs/          pages: blog/, docs/, projects/, css/, js/, img/
overrides/     theme templates
zensical.toml  site config, navigation and the project list
```

Every push to `main` is built and deployed by [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).
