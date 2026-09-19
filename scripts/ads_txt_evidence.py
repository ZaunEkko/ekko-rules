"""Collect advertising-system declarations from publisher ads.txt files.

IAB ads.txt is a file a publisher serves from its own root listing every
advertising system it authorises to sell its inventory. Each data line starts
with that system's domain, so the file is the publisher's own statement that a
domain is advertising infrastructure — first-party evidence, gathered without
consulting anyone else's rule list.

This complements the traffic observation in ``rule_evidence.py``: traffic shows
what a page actually loaded, ads.txt shows the declared ecosystem behind it.
Neither admits a rule on its own; both feed the per-host review in
docs/SELF-OWNED-REBUILD.md.

Usage::

    python scripts/ads_txt_evidence.py publishers.txt evidence.json

``publishers.txt`` holds one publisher origin per line.
"""

from __future__ import annotations

import concurrent.futures
import json
import sys
import urllib.error
import urllib.request
from collections import defaultdict
from pathlib import Path

TIMEOUT = 20
WORKERS = 12
MAX_BYTES = 4_000_000
USER_AGENT = "ekko-rules-evidence/1 (+https://github.com/ZaunEkko/ekko-rules)"


def fetch(origin: str) -> tuple[str, str | None]:
    """Fetch ``origin``'s ads.txt, returning its text or None."""
    url = origin.rstrip("/") + "/ads.txt"
    request = urllib.request.Request(url, headers={"user-agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            if response.status != 200:
                return origin, None
            body = response.read(MAX_BYTES)
    except (urllib.error.URLError, TimeoutError, OSError):
        return origin, None
    return origin, body.decode("utf-8", errors="replace")


def parse(text: str) -> set[str]:
    """Return the advertising-system domains declared in an ads.txt body.

    A data line is ``<system domain>, <publisher id>, <DIRECT|RESELLER>[, cert]``.
    Variable declarations such as ``CONTACT=`` and ``OWNERDOMAIN=`` are skipped,
    as are comments and anything that does not look like a hostname.
    """
    systems: set[str] = set()
    for raw in text.splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line or "=" in line.split(",", 1)[0]:
            continue
        field = line.split(",", 1)[0].strip().lower().rstrip(".")
        if not field or " " in field or "." not in field:
            continue
        if field.startswith(("http://", "https://")):
            field = field.split("//", 1)[1].split("/", 1)[0]
        labels = field.split(".")
        if len(labels) < 2 or not all(labels):
            continue
        if not all(part.replace("-", "").isalnum() for part in labels):
            continue
        systems.add(field)
    return systems


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(__doc__, file=sys.stderr)
        return 2
    publishers = [
        line.strip()
        for line in Path(argv[1]).read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.startswith("#")
    ]

    declared_by: dict[str, set[str]] = defaultdict(set)
    served, missing = [], []
    with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as pool:
        for origin, text in pool.map(fetch, publishers):
            if text is None:
                missing.append(origin)
                continue
            served.append(origin)
            for system in parse(text):
                declared_by[system].add(origin)

    records = [
        {
            "system": system,
            "declared_by": sorted(origins),
            "publisher_count": len(origins),
        }
        for system, origins in sorted(
            declared_by.items(), key=lambda item: (-len(item[1]), item[0])
        )
    ]
    document = {
        "schema_version": 1,
        "method": "IAB ads.txt declarations fetched from publisher roots; no upstream rule list consumed",
        "publishers_served": sorted(served),
        "publishers_without_ads_txt": sorted(missing),
        "summary": {
            "publishers": len(publishers),
            "served": len(served),
            "systems": len(records),
            "systems_declared_by_two_or_more": sum(
                1 for record in records if record["publisher_count"] >= 2
            ),
        },
        "records": records,
    }
    output = Path(argv[2])
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(document, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    summary = document["summary"]
    print(
        f"{summary['served']}/{summary['publishers']} publishers served ads.txt; "
        f"{summary['systems']} advertising systems declared, "
        f"{summary['systems_declared_by_two_or_more']} by two or more"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
