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
TIMEOUT = 45
WORKERS = 3
# crt.sh throttles bursts and answers an over-eager client with an empty body,
# which is indistinguishable from "this organisation has no certificates".
# Retrying with a growing pause tells the two apart.
ATTEMPTS = 2
BACKOFF_SECONDS = 8

MULTI_LABEL_SUFFIXES = frozenset(
    {
        "com.cn", "net.cn", "org.cn", "gov.cn", "edu.cn", "ac.cn",
        "com.hk", "net.hk", "org.hk", "com.tw", "net.tw", "org.tw",
        "com.sg", "com.my", "co.jp", "ne.jp", "or.jp", "co.kr", "or.kr",
        "co.uk", "org.uk", "me.uk", "ac.uk", "gov.uk", "co.nz", "net.nz",
        "com.au", "net.au", "org.au", "com.br", "com.mx", "com.ar",
        "com.co", "com.pe", "com.uy", "com.ec", "com.gt", "com.pt",
        "com.es", "com.tr", "com.ua", "net.ua", "org.ua", "pp.ua",
        "com.ru", "net.ru", "org.ru", "com.bd", "com.pk", "co.in",
        "co.za", "co.zw", "co.il", "com.vn", "com.ph", "com.kz",
        "eu.org", "co.id", "or.id", "com.ng", "com.eg", "com.sa",
    }
)
# A certificate covering many unrelated registrable roots is a shared or CDN
# certificate, and the tenants on it prove nothing about each other. Reading
# one as a vendor's portfolio pulls in whoever else happened to share it:
# Chartboost's certificate named Cisco, SmartAdServer's named Broadcom.
SHARED_CERTIFICATE_ROOTS = 12
VALID_ROOT = re.compile(r"^[a-z0-9]([a-z0-9\-]*[a-z0-9])?(\.[a-z0-9\-]+)*\.[a-z]{2,}$")


def registrable_root(host: str) -> str:
    labels = host.strip().lower().lstrip("*.").strip(".").split(".")
    if len(labels) < 2:
        return ""
    if len(labels) >= 3 and ".".join(labels[-2:]) in MULTI_LABEL_SUFFIXES:
        return ".".join(labels[-3:])
    return ".".join(labels[-2:])


def query(term: str) -> tuple[str, list[str]]:
    """Return the registrable roots certificates name for ``term``.

    A term containing a dot is read as a domain and searched with ``q``, which
    returns that domain's certificates. Those certificates also carry their
    other subject alternative names, so a multi-domain certificate exposes the
    sibling domains a vendor runs under unrelated-looking names. Anything else
    is read as an organisation and searched with ``O``.
    """
    field, value = ("q", f"%.{term}") if "." in term else ("O", f"%{term}%")
    url = CRT_SH + "?" + urllib.parse.urlencode({field: value, "output": "json"})
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
        names: set[str] = set()
        for key in ("common_name", "name_value"):
            names.update(str(entry.get(key, "")).split("\n"))
        certificate_roots = {
            root
            for root in (registrable_root(name) for name in names)
            if root and VALID_ROOT.match(root) and not root[0].isdigit()
        }
        if len(certificate_roots) > SHARED_CERTIFICATE_ROOTS:
            continue
        roots |= certificate_roots
    return term, sorted(roots)


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
