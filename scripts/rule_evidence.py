"""Independent evidence collection for repository-maintained rule curation.

The canonical rulesets under ``sources/rules`` are curated from this repository's
own observations. This module turns a set of observed hostnames into an evidence
record that a reviewer can act on: where the host was seen, how often, what it
resolves to, and which registrable root it belongs to.

It deliberately does not consume any upstream rule list. Candidate hostnames come
from observation captures (see ``load_capture``), so the selection boundary stays
local rather than inheriting another project's.

Usage::

    python scripts/rule_evidence.py capture.json evidence.json

``capture.json`` maps an observed origin to the hostnames its page requested::

    {"https://example.com": ["a.example.com", "tracker.example.net"]}
"""

from __future__ import annotations

import concurrent.futures
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable

DOH_ENDPOINT = "https://dns.google/resolve"
RESOLVE_TIMEOUT = 10
RESOLVE_WORKERS = 16

# Registrable-suffix shapes that need one more label than a bare "a.b" split.
MULTI_LABEL_SUFFIXES = frozenset(
    {
        "com.cn", "net.cn", "org.cn", "gov.cn", "edu.cn", "ac.cn",
        "com.hk", "com.tw", "com.au", "com.br", "co.uk", "co.jp",
        "co.kr", "com.sg", "com.my", "co.in", "com.mx", "com.tr",
    }
)


def registrable_root(host: str) -> str:
    """Return the registrable root of ``host``.

    ``a.b.example.com.cn`` -> ``example.com.cn``; ``x.example.com`` -> ``example.com``.
    """
    labels = host.strip(".").lower().split(".")
    if len(labels) <= 2:
        return ".".join(labels)
    if ".".join(labels[-2:]) in MULTI_LABEL_SUFFIXES:
        return ".".join(labels[-3:])
    return ".".join(labels[-2:])


def resolve(host: str) -> dict[str, Any]:
    """Resolve ``host`` over DoH and report status plus the answer chain."""
    query = urllib.parse.urlencode({"name": host, "type": "A"})
    request = urllib.request.Request(
        f"{DOH_ENDPOINT}?{query}",
        headers={"accept": "application/dns-json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=RESOLVE_TIMEOUT) as response:
            payload = json.load(response)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
        return {"status": None, "resolves": None, "chain": []}
    status = payload.get("Status")
    answers = payload.get("Answer") or []
    return {
        "status": status,
        "resolves": status == 0 and bool(answers),
        "chain": [answer.get("data", "") for answer in answers],
    }


def load_capture(path: Path) -> dict[str, list[str]]:
    """Read an observation capture: origin -> hostnames requested by that page."""
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise SystemExit(f"{path}: capture must be an object of origin -> hostnames")
    capture: dict[str, list[str]] = {}
    for origin, hosts in data.items():
        if not isinstance(hosts, list):
            raise SystemExit(f"{path}: {origin} must map to a list of hostnames")
        capture[origin] = [str(host).strip().lower() for host in hosts if str(host).strip()]
    return capture


def build_evidence(capture: dict[str, list[str]]) -> list[dict[str, Any]]:
    """Turn a capture into per-host evidence records, resolution included."""
    origins: dict[str, set[str]] = defaultdict(set)
    for origin, hosts in capture.items():
        for host in hosts:
            origins[host].add(origin)

    hosts = sorted(origins)
    with concurrent.futures.ThreadPoolExecutor(max_workers=RESOLVE_WORKERS) as pool:
        resolutions = list(pool.map(resolve, hosts))

    records = []
    for host, resolution in zip(hosts, resolutions):
        seen_on = sorted(origins[host])
        root = registrable_root(host)
        records.append(
            {
                "host": host,
                "registrable_root": root,
                "seen_on": seen_on,
                "site_count": len(seen_on),
                "first_party": any(
                    root == registrable_root(urllib.parse.urlparse(origin).hostname or "")
                    for origin in seen_on
                ),
                "resolution": resolution,
            }
        )
    return records


def summarise(records: Iterable[dict[str, Any]]) -> dict[str, Any]:
    """Aggregate the signals a reviewer sorts on."""
    records = list(records)
    third_party = [record for record in records if not record["first_party"]]
    roots: dict[str, set[str]] = defaultdict(set)
    for record in third_party:
        roots[record["registrable_root"]].update(record["seen_on"])
    return {
        "hosts": len(records),
        "third_party_hosts": len(third_party),
        "third_party_roots": len(roots),
        "unresolved_hosts": sum(
            1 for record in records if record["resolution"]["resolves"] is False
        ),
        "roots_by_reach": [
            {"root": root, "site_count": len(origins), "sites": sorted(origins)}
            for root, origins in sorted(
                roots.items(), key=lambda item: (-len(item[1]), item[0])
            )
        ],
    }


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(__doc__, file=sys.stderr)
        return 2
    capture_path, output_path = Path(argv[1]), Path(argv[2])
    capture = load_capture(capture_path)
    records = build_evidence(capture)
    document = {
        "schema_version": 1,
        "method": "independent observation capture; no upstream rule list consumed",
        "origins_observed": sorted(capture),
        "summary": summarise(records),
        "records": records,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(document, ensure_ascii=False, indent=2, sort_keys=False) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    summary = document["summary"]
    print(
        f"{summary['hosts']} hosts across {len(capture)} origins; "
        f"{summary['third_party_hosts']} third-party "
        f"({summary['third_party_roots']} roots); "
        f"{summary['unresolved_hosts']} do not resolve"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
