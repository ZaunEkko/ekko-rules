"""Discover a vendor's domain portfolio from Certificate Transparency logs.

Scanning a homepage finds what that page links to. It does not find the
backend, sub-brand and infrastructure domains a large vendor also operates —
`servicewechat.com`, `byteacct.com`, `alipaylog.com` — because no homepage
links to them. Those domains still need a routing policy.

Certificate Transparency fills the gap from a primary source. Every publicly
trusted certificate is logged, and the log records the organisation the
certificate was issued to, so querying by organisation returns the domains a
vendor proved control of to a certificate authority. That is the vendor's own
attestation, not a third party's list.

Discovery supplies candidates only. Whether a candidate belongs on a mainland
direct policy is decided separately by ``mainland_hosting_probe.py``.

Usage::

    python scripts/vendor_domain_discovery.py organisations.txt roots.json
"""

from __future__ import annotations

import concurrent.futures
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

CRT_SH = "https://crt.sh/"
TIMEOUT = 180
WORKERS = 2
# crt.sh throttles bursts and answers an over-eager client with an empty body,
# which is indistinguishable from "this organisation has no certificates".
# Retrying with a growing pause tells the two apart.
ATTEMPTS = 4
BACKOFF_SECONDS = 6

MULTI_LABEL_SUFFIXES = frozenset(
    {
        "com.cn", "net.cn", "org.cn", "gov.cn", "edu.cn", "ac.cn",
        "com.hk", "com.tw", "com.sg", "com.my", "co.jp", "co.kr",
    }
)
VALID_ROOT = re.compile(r"^[a-z0-9]([a-z0-9\-]*[a-z0-9])?(\.[a-z0-9\-]+)*\.[a-z]{2,}$")


def registrable_root(host: str) -> str:
    labels = host.strip().lower().lstrip("*.").strip(".").split(".")
    if len(labels) < 2:
        return ""
    if len(labels) >= 3 and ".".join(labels[-2:]) in MULTI_LABEL_SUFFIXES:
        return ".".join(labels[-3:])
    return ".".join(labels[-2:])


def query(organisation: str) -> tuple[str, list[str]]:
    """Return the registrable roots certificates name for ``organisation``."""
    url = CRT_SH + "?" + urllib.parse.urlencode(
        {"O": f"%{organisation}%", "output": "json"}
    )
    request = urllib.request.Request(url, headers={"user-agent": "ekko-rules-evidence/1"})
    entries: list[dict[str, object]] = []
    for attempt in range(ATTEMPTS):
        try:
            with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
                entries = json.load(response)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
            entries = []
        if entries:
            break
        if attempt + 1 < ATTEMPTS:
            time.sleep(BACKOFF_SECONDS * (attempt + 1))
    roots = set()
    for entry in entries:
        for field in ("common_name", "name_value"):
            for name in str(entry.get(field, "")).split("\n"):
                root = registrable_root(name)
                if root and VALID_ROOT.match(root) and not root[0].isdigit():
                    roots.add(root)
    return organisation, sorted(roots)


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(__doc__, file=sys.stderr)
        return 2
    organisations = [
        line.strip()
        for line in Path(argv[1]).read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.startswith("#")
    ]
    attested: dict[str, set[str]] = defaultdict(set)
    with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as pool:
        for organisation, roots in pool.map(query, organisations):
            for root in roots:
                attested[root].add(organisation)

    document = {
        "schema_version": 1,
        "method": "Certificate Transparency organisation search; each root was proved to a certificate authority by the named organisation",
        "source": CRT_SH,
        "organisations": organisations,
        "summary": {
            "organisations": len(organisations),
            "roots": len(attested),
        },
        "records": [
            {"root": root, "attested_by": sorted(orgs)}
            for root, orgs in sorted(attested.items())
        ],
    }
    Path(argv[2]).write_text(
        json.dumps(document, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(f"{len(organisations)} organisations attest {len(attested)} registrable roots")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
