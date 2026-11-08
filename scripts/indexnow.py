"""Tell IndexNow search engines (Bing, Yandex, Seznam, Naver…) which pages changed in a deploy.

Two steps, both in .github/workflows/deploy.yml:

  python3 scripts/indexnow.py changed site/sitemap.xml > indexnow-urls.txt
      Before the deploy: compares the new sitemap with the live one and prints the URLs that are new or have
      a different <lastmod>. If the live sitemap cannot be read, prints nothing (no guessing).

  python3 scripts/indexnow.py submit indexnow-urls.txt
      After the deploy: sends those URLs to api.indexnow.org. Problems are reported as warnings, never as a
      failed deploy.

The key is public by design: search engines check it at https://<site>/<KEY>.txt (docs/<KEY>.txt).
Google does not use IndexNow; for Google, the sitemap in Search Console is enough.
Standard library only.
"""

import json
import sys
import urllib.error
import urllib.request
from pathlib import Path
from xml.etree import ElementTree as ET

KEY = "b8906d7bcaa4a08bfd916af3490302fc"
ENDPOINT = "https://api.indexnow.org/indexnow"
NS = "{http://www.sitemaps.org/schemas/sitemap/0.9}"
LIMIT = 10_000  # URLs per request allowed by the protocol
# Cloudflare answers 403 to Python's default User-Agent
HEADERS = {"User-Agent": "site-indexnow/1.0 (+https://github.com/serhiismetanskyi)"}


def entries(xml: bytes) -> dict[str, str]:
    """URL → lastmod (empty when missing) from sitemap XML."""
    result = {}
    for url in ET.fromstring(xml).iter(f"{NS}url"):
        loc = (url.findtext(f"{NS}loc") or "").strip()
        if loc:
            result[loc] = (url.findtext(f"{NS}lastmod") or "").strip()
    return result


def changed(sitemap: Path) -> int:
    new = entries(sitemap.read_bytes())
    home = min(new, key=len)
    try:
        request = urllib.request.Request(f"{home}sitemap.xml", headers=HEADERS)
        with urllib.request.urlopen(request, timeout=30) as response:
            live = entries(response.read())
    except (urllib.error.URLError, ET.ParseError, TimeoutError) as error:
        print(f"indexnow.py: live sitemap not readable ({error}), nothing to submit", file=sys.stderr)
        return 0
    urls = [url for url, lastmod in new.items() if url not in live or live[url] != lastmod]
    print("\n".join(urls))
    print(f"indexnow.py: {len(urls)} new or updated URLs", file=sys.stderr)
    return 0


def submit(listing: Path) -> int:
    urls = [line.strip() for line in listing.read_text().splitlines() if line.strip()][:LIMIT]
    if not urls:
        print("indexnow.py: no changed URLs, nothing to submit")
        return 0
    home = min(urls, key=len).split("/", 3)
    host = home[2]
    body = {"host": host, "key": KEY, "keyLocation": f"https://{host}/{KEY}.txt", "urlList": urls}
    request = urllib.request.Request(
        ENDPOINT,
        data=json.dumps(body).encode(),
        headers={**HEADERS, "Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            print(f"indexnow.py: submitted {len(urls)} URLs, HTTP {response.status}")
    except urllib.error.HTTPError as error:
        print(f"::warning::IndexNow answered HTTP {error.code} for {len(urls)} URLs: {error.read()[:300]!r}")
    except (urllib.error.URLError, TimeoutError) as error:
        print(f"::warning::IndexNow not reachable: {error}")
    return 0


def main() -> int:
    if len(sys.argv) == 3 and sys.argv[1] == "changed":
        return changed(Path(sys.argv[2]))
    if len(sys.argv) == 3 and sys.argv[1] == "submit":
        return submit(Path(sys.argv[2]))
    print(__doc__, file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main())
