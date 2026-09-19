"""Extract the hostnames a page's markup references.

Rendering a page in a browser shows exactly what it requested, but it is slow
and cannot reach the hundreds of origins a corpus needs. Fetching the document
and reading the hostnames out of its markup is far less precise — it misses
anything a script builds at runtime — but it scales, and for deriving which
services a site belongs to that is the trade worth making.

Use it for breadth and the browser capture for depth; both are this
repository's own observation, and neither admits a rule on its own.

Usage::

    python scripts/page_host_scan.py origins.txt hosts.json
"""

from __future__ import annotations

import concurrent.futures
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
import zlib
from collections import defaultdict
from pathlib import Path

TIMEOUT = 20
WORKERS = 16
MAX_BYTES = 3_000_000
# A page's markup names its CDN and image hosts, but the endpoints an
# application actually calls are usually built inside its script bundles.
# Following a few scripts per origin reaches them without a browser.
SCRIPTS_PER_ORIGIN = 6
SCRIPT_MAX_BYTES = 2_000_000
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/140.0 Safari/537.36"
)

# src=, href=, url(), and protocol-relative or absolute URLs inside scripts.
#
# A bare "//" is not enough to anchor on: minified JavaScript ends statements
# with trailing line comments such as "}//console.log(x)", and the text after
# the slashes then looks exactly like a hostname. Requiring either an explicit
# scheme or a delimiter that precedes a URL in markup and script keeps those
# out without losing protocol-relative references.
HOST_PATTERN = re.compile(
    r"""(?:https?://|(?<=[\s"'`(=\[{])//)([a-z0-9](?:[a-z0-9\-._]*[a-z0-9])?\.[a-z]{2,})""",
    re.IGNORECASE,
)


def decode(raw: bytes, encoding: str | None) -> str:
    """Decode a body, tolerating a stream cut short by the read limit.

    Reading at most MAX_BYTES routinely truncates a compressed response, so the
    one-shot decompressors raise. An incremental decompressor keeps whatever it
    managed to inflate, which is all this scan needs.
    """
    if encoding in {"gzip", "deflate", "zlib"}:
        wbits = 47 if encoding == "gzip" else zlib.MAX_WBITS
        for bits in (wbits, -zlib.MAX_WBITS):
            try:
                raw = zlib.decompressobj(bits).decompress(raw)
                break
            except zlib.error:
                continue
    return raw.decode("utf-8", errors="replace")


SCRIPT_SRC = re.compile(
    r"""<script[^>]+src\s*=\s*["']([^"']+)["']""", re.IGNORECASE
)


def fetch(url: str, limit: int) -> str | None:
    request = urllib.request.Request(
        url,
        headers={
            "user-agent": USER_AGENT,
            "accept": "*/*",
            "accept-encoding": "gzip, deflate",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            return decode(response.read(limit), response.headers.get("content-encoding"))
    except (urllib.error.URLError, TimeoutError, OSError, ValueError):
        return None


def scan(origin: str) -> tuple[str, list[str] | None]:
    """Fetch ``origin`` and return the hostnames it and its scripts reference."""
    text = fetch(origin, MAX_BYTES)
    if text is None:
        return origin, None
    hosts = {match.group(1).lower().rstrip(".") for match in HOST_PATTERN.finditer(text)}

    scripts = []
    for match in SCRIPT_SRC.finditer(text):
        src = urllib.parse.urljoin(origin, match.group(1).strip())
        if src.startswith(("http://", "https://")) and src not in scripts:
            scripts.append(src)
        if len(scripts) >= SCRIPTS_PER_ORIGIN:
            break
    for src in scripts:
        body = fetch(src, SCRIPT_MAX_BYTES)
        if body:
            hosts |= {
                match.group(1).lower().rstrip(".")
                for match in HOST_PATTERN.finditer(body)
            }

    return origin, sorted(host for host in hosts if not host.endswith(".w3.org"))


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(__doc__, file=sys.stderr)
        return 2
    origins = [
        line.strip()
        for line in Path(argv[1]).read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.startswith("#")
    ]
    captured: dict[str, list[str]] = {}
    failed: list[str] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as pool:
        for origin, hosts in pool.map(scan, origins):
            if hosts is None:
                failed.append(origin)
            else:
                captured[origin] = hosts

    seen: dict[str, set[str]] = defaultdict(set)
    for origin, hosts in captured.items():
        for host in hosts:
            seen[host].add(origin)
    Path(argv[2]).write_text(
        json.dumps(
            {k: captured[k] for k in sorted(captured)}, ensure_ascii=False, indent=2
        )
        + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(
        f"{len(captured)}/{len(origins)} origins scanned, "
        f"{len(seen)} distinct hostnames, {len(failed)} failed"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
