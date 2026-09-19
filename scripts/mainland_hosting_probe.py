"""Decide whether a domain is served from mainland China.

The mainland direct policy answers one question per domain: is this a service
whose traffic belongs on DIRECT? Observation alone cannot answer it — a
mainland page also references foreign fonts, libraries and advertising — so
observation supplies candidates and this probe supplies the verdict.

The verdict comes from a primary source. APNIC publishes the registry's own
delegation records, so the address ranges it allocated to CN are authoritative
rather than inferred. A domain whose A records land inside those ranges is
served from the mainland and belongs on DIRECT; one that does not is a foreign
service a mainland page happens to reference.

Usage::

    python scripts/mainland_hosting_probe.py candidates.txt verdicts.json
"""

from __future__ import annotations

import bisect
import concurrent.futures
import ipaddress
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

APNIC_DELEGATIONS = "https://ftp.apnic.net/stats/apnic/delegated-apnic-latest"
DOH_ENDPOINT = "https://dns.google/resolve"
TIMEOUT = 20
WORKERS = 24

# The question a mainland direct rule needs answered is "where is a client in
# the mainland served from", and this probe runs outside it. Without saying so,
# the resolver answers for where the query came from: xinhuanet.com returns
# 156.238.128.x from here and 117.177.70.x for a mainland client, so the probe
# called a China Mobile-hosted site foreign. EDNS Client Subnet asks the
# question properly by naming the client network the answer is for.
#
# Not every operator honours it. Cloudflare answers from anycast and returns the
# same address whatever subnet is named, so a domain on it stays unadjudicable -
# which is a true finding about the method, not a verdict about the domain.
CLIENT_SUBNET = "223.5.5.0/24"


def load_cn_ranges() -> list[tuple[int, int]]:
    """Return sorted (start, end) integer ranges APNIC delegated to CN."""
    request = urllib.request.Request(
        APNIC_DELEGATIONS, headers={"user-agent": "ekko-rules-evidence/1"}
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        body = response.read().decode("utf-8", errors="replace")

    ranges: list[tuple[int, int]] = []
    for line in body.splitlines():
        fields = line.split("|")
        if len(fields) < 5 or fields[1] != "CN" or fields[2] != "ipv4":
            continue
        try:
            start = int(ipaddress.IPv4Address(fields[3]))
            count = int(fields[4])
        except (ipaddress.AddressValueError, ValueError):
            continue
        ranges.append((start, start + count - 1))
    ranges.sort()
    return ranges


def in_cn(address: str, starts: list[int], ranges: list[tuple[int, int]]) -> bool:
    try:
        value = int(ipaddress.IPv4Address(address))
    except ipaddress.AddressValueError:
        return False
    index = bisect.bisect_right(starts, value) - 1
    return index >= 0 and value <= ranges[index][1]


def resolve(host: str) -> list[str]:
    query = urllib.parse.urlencode(
        {"name": host, "type": "A", "edns_client_subnet": CLIENT_SUBNET}
    )
    request = urllib.request.Request(
        f"{DOH_ENDPOINT}?{query}", headers={"accept": "application/dns-json"}
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            payload = json.load(response)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
        return []
    if payload.get("Status") != 0:
        return []
    return [
        answer["data"]
        for answer in payload.get("Answer", [])
        if answer.get("type") == 1 and "data" in answer
    ]


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(__doc__, file=sys.stderr)
        return 2
    candidates = [
        line.strip().lower()
        for line in Path(argv[1]).read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.startswith("#")
    ]
    ranges = load_cn_ranges()
    starts = [start for start, _ in ranges]

    def verdict(root: str) -> dict[str, object]:
        addresses = resolve(root) or resolve(f"www.{root}")
        mainland = [a for a in addresses if in_cn(a, starts, ranges)]
        return {
            "root": root,
            "addresses": addresses,
            "mainland_addresses": mainland,
            "mainland_hosted": bool(addresses) and len(mainland) == len(addresses),
            "mixed_hosting": bool(mainland) and len(mainland) != len(addresses),
        }

    with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as pool:
        records = list(pool.map(verdict, candidates))

    mainland = [r for r in records if r["mainland_hosted"]]
    mixed = [r for r in records if r["mixed_hosting"]]
    foreign = [
        r for r in records if r["addresses"] and not r["mainland_addresses"]
    ]
    unresolved = [r for r in records if not r["addresses"]]
    document = {
        "schema_version": 1,
        "method": f"APNIC delegation records define the CN address space; a candidate is mainland-hosted when every A record falls inside it. Resolution names {CLIENT_SUBNET} as the client subnet so the answer is the one a mainland client receives rather than the one this probe's own location earns",
        "source": APNIC_DELEGATIONS,
        "cn_ranges": len(ranges),
        "summary": {
            "candidates": len(records),
            "mainland_hosted": len(mainland),
            "mixed_hosting": len(mixed),
            "foreign_hosted": len(foreign),
            "unresolved": len(unresolved),
        },
        "records": sorted(records, key=lambda record: record["root"]),
    }
    Path(argv[2]).write_text(
        json.dumps(document, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(
        f"{len(records)} candidates against {len(ranges)} CN ranges: "
        f"{len(mainland)} mainland-hosted, {len(mixed)} mixed, "
        f"{len(foreign)} foreign, {len(unresolved)} unresolved"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
