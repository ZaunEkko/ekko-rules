"""Test whether a candidate advertising domain actually serves advertising.

An ads.txt declaration names the company that sells inventory, which is not
always the domain that delivers the advertising at runtime: OpenX declares
``openx.com`` but bids from ``openx.net``, Xandr declares ``appnexus.com`` but
serves from ``adnxs.com``. Blocking a company's corporate site stops nothing,
and a rule that stops nothing is the defect this rebuild exists to remove.

This probe resolves the delivery-shaped hostnames an advertising platform
conventionally runs. A root that answers on at least one of them has live
delivery infrastructure and a root-level rule on it does something. A root that
answers only on its apex is a corporate website and is reported separately.

Usage::

    python scripts/ad_serving_probe.py candidates.txt results.json
"""

from __future__ import annotations

import concurrent.futures
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

DOH_ENDPOINT = "https://dns.google/resolve"
TIMEOUT = 10
WORKERS = 24

# Subdomains advertising platforms conventionally use for delivery, bidding,
# identity syncing and creative hosting.
DELIVERY_LABELS = (
    "ad", "ads", "rtb", "bid", "bidder", "prebid", "hb",
    "sync", "pixel", "px", "c", "s", "cdn", "static", "img", "tag", "js",
)


def resolves(host: str) -> bool:
    query = urllib.parse.urlencode({"name": host, "type": "A"})
    request = urllib.request.Request(
        f"{DOH_ENDPOINT}?{query}", headers={"accept": "application/dns-json"}
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            payload = json.load(response)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
        return False
    return payload.get("Status") == 0 and bool(payload.get("Answer"))


def probe(root: str) -> dict[str, object]:
    """Report whether ``root`` has an apex and any delivery hostname."""
    apex = resolves(root)
    delivery = [
        label for label in DELIVERY_LABELS if resolves(f"{label}.{root}")
    ]
    return {
        "root": root,
        "apex_resolves": apex,
        "delivery_hosts": [f"{label}.{root}" for label in delivery],
        "serves_advertising": bool(delivery),
    }


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(__doc__, file=sys.stderr)
        return 2
    roots = [
        line.strip().lower()
        for line in Path(argv[1]).read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.startswith("#")
    ]
    with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as pool:
        results = list(pool.map(probe, roots))

    serving = [record for record in results if record["serves_advertising"]]
    corporate = [
        record
        for record in results
        if not record["serves_advertising"] and record["apex_resolves"]
    ]
    dead = [
        record
        for record in results
        if not record["serves_advertising"] and not record["apex_resolves"]
    ]
    document = {
        "schema_version": 1,
        "method": "resolve conventional advertising-delivery hostnames under each candidate root",
        "delivery_labels": list(DELIVERY_LABELS),
        "summary": {
            "candidates": len(results),
            "serving": len(serving),
            "corporate_only": len(corporate),
            "not_resolving": len(dead),
        },
        "records": sorted(results, key=lambda record: record["root"]),
    }
    Path(argv[2]).write_text(
        json.dumps(document, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(
        f"{len(results)} candidates: {len(serving)} serve advertising, "
        f"{len(corporate)} corporate site only, {len(dead)} do not resolve"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
