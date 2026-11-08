"""Complete site/sitemap.xml after `zensical build`.

Zensical lists only the pages that are in `nav`, so blog posts and project pages (which are not) are missing.
This script adds every built page that is not there yet, and gives each URL a <lastmod> from the page's
`article:modified_time` meta tag (blog posts and Docs articles; see overrides/main.html).

Left out: pages with `<meta name="robots" content="noindex">` and later pages of paginated lists (…/page/2/).

Usage: python scripts/sitemap.py [site_dir]   (default: site)
Standard library only, so it runs in CI, in Docker and locally without extra packages.
"""

import re
import sys
from pathlib import Path
from xml.etree import ElementTree as ET

NS = "http://www.sitemaps.org/schemas/sitemap/0.9"
MODIFIED = re.compile(r'<meta property="article:modified_time" content="(\d{4}-\d{2}-\d{2})')
NOINDEX = re.compile(r'<meta name="robots" content="[^"]*noindex')
PAGINATED = re.compile(r"/page/\d+/$")


def page_path(site: Path, url: str, base: str) -> Path:
    """Built index.html for a sitemap URL."""
    return site / url.removeprefix(base) / "index.html"


def main() -> int:
    site = Path(sys.argv[1] if len(sys.argv) > 1 else "site")
    sitemap = site / "sitemap.xml"
    if not sitemap.is_file():
        print(f"sitemap.py: {sitemap} not found, run the build first", file=sys.stderr)
        return 1

    ET.register_namespace("", NS)
    tree = ET.parse(sitemap)
    root = tree.getroot()
    urls = [loc.text.strip() for loc in root.iter(f"{{{NS}}}loc") if loc.text]
    if not urls:
        print("sitemap.py: the sitemap has no URLs", file=sys.stderr)
        return 1
    # The home page is the shortest URL: https://example.com/
    base = min(urls, key=len)

    known = set(urls)
    added = []
    for index in sorted(site.rglob("index.html")):
        rel = index.parent.relative_to(site).as_posix()
        url = base if rel == "." else f"{base}{rel}/"
        if url in known or PAGINATED.search(url):
            continue
        if NOINDEX.search(index.read_text(encoding="utf-8", errors="ignore")):
            continue
        added.append(url)

    for url in added:
        entry = ET.SubElement(root, f"{{{NS}}}url")
        ET.SubElement(entry, f"{{{NS}}}loc").text = url

    dated = 0
    for entry in root.iter(f"{{{NS}}}url"):
        loc = entry.find(f"{{{NS}}}loc")
        if loc is None or not loc.text:
            continue
        for old in entry.findall(f"{{{NS}}}lastmod"):
            entry.remove(old)
        path = page_path(site, loc.text.strip(), base)
        match = MODIFIED.search(path.read_text(encoding="utf-8", errors="ignore")) if path.is_file() else None
        if match:
            ET.SubElement(entry, f"{{{NS}}}lastmod").text = match.group(1)
            dated += 1

    ET.indent(tree, space="  ")
    tree.write(sitemap, encoding="UTF-8", xml_declaration=True)
    total = len(urls) + len(added)
    print(f"sitemap.py: {total} URLs ({len(added)} added), {dated} with lastmod")
    return 0


if __name__ == "__main__":
    sys.exit(main())
