# Provenance

## Current canonical product

The sanitized `sources/` tree is the sole canonical input. Normal generation is offline and does not fetch upstream projects, Git history, DNS, or an MMDB. The current manifest defines one standard product with 61 rule files, 62 ordered segments including FINAL, 36 proxy groups, and 5,729 rules including FINAL. Subconverter and Mihomo consume the same ordered rule corpus through one entry point each.

The product contains 206 destination-IP matchers, all with `no-resolve`. Its terminal order is all specialized rules, six late-recovery rulesets, the classic mainland-domain layer, `GEOIP,CN,DIRECT,no-resolve`, and the unique FINAL. It publishes no automatic-latency group, proxy-provider health probe, Full/local preset, Extended variant, or repository-owned Clash base configuration.

## Classic mainland-domain import

`sources/rules/china-domains-direct.list` is a one-time deterministic import from `v2fly/domain-list-community` revision `660198a50bac2ab10c567d95a472a7b33915d1b0`, licensed under MIT (`Copyright (c) 2018-2019 V2Ray`). The selection reads direct `domain` and `full` entries from 31 named mainland service categories without recursively expanding includes. It excludes `!cn` entries, keywords, regular expressions, single-label suffixes, coverage within the selected bundle, and matchers already covered by earlier canonical rules.

The emitted file contains 1,482 anchored matchers: 1,481 `DOMAIN-SUFFIX` entries and one `DOMAIN` entry. The source revision, category list, selection counts, output digest, and license digest are frozen in `tests/fixtures/china-domain-import-ledger.json`. Normal generation reads only the emitted canonical file and never fetches v2fly data or requires GEOSITE support.

ACL4SSR's pinned ChinaDomain corpus was evaluated as an alternative but not imported because its CC-BY-SA-4.0 license would create a separate ShareAlike component and mixed-license publication boundary.

## Reconstruction and immutable evidence

The one-time reconstruction was cross-checked against the original Subconverter presets, Mihomo providers, Mihomo rule order, and existing `.list` files before `sources/` became canonical. `tests/fixtures/phase-2-before.json`, the Phase 2 after fixture, and the migration ledger preserve that historical state without treating current generated products as source evidence.

Phase 3 evidence remains layered and immutable:

- `phase-3-after.json` preserves the 1,615-rule historical Extended reduction before compatibility recovery;
- `phase-3-migration-ledger.json` proves that reduction against the frozen Phase 2 state;
- `phase-3-recovery-ledger.json` derives 2,737 first-effective DIRECT-default candidates from frozen Phase 2 history at `8dbf3e6f7c2aedfa0fd9c485f63d76c1ace31faf`;
- the security filter excludes seven historical `DOMAIN-KEYWORD` candidates and adds the anchored `roblox.com` and `rbxcdn.com` suffixes, leaving 2,732 matchers in six late-recovery rulesets. Their current placement is before the classic mainland-domain layer, terminal `GEOIP,CN,DIRECT,no-resolve`, and FINAL.

The Roblox replacement is supported by Roblox's official education-network allowlist. Normal generation still performs no fetch. Recovery is historical default-routing evidence, not renewed evidence that every recovered domain or IP is currently or exclusively owned by the mapped vendor.

## Historical comparison results

Audit results retained as evidence include:

- 13,591 of 13,919 unique local historical matchers appeared in the pinned blackmatrix7 Clash corpus (97.64%). This establishes substantial shared content, not a specific direct source.
- Approximately 6,233 of 6,242 historical `global-web` entries matched ACL4SSR's 2023-06-04 `Clash/ProxyGFWlist.list` in original order (about 99.86%). Phase 3 removed that generic segment; the result remains historical lineage evidence only.
- ACL4SSR informed the Subconverter responsibility boundary: Ekko Rules does not own ports, DNS, TUN, controller settings, or other client configuration above `proxies`.

## Limits of the evidence

The expanded source profile does not preserve:

- the original repository and revision for every individual matcher;
- original upstream file boundaries inside contiguous target segments;
- the original converter's exact node-filter expressions;
- proxy node names, addresses, ports, passwords, keys, or subscription URL;
- provider-specific DNS, TUN, Hosts, or other client configuration;
- proof that one aggregate upstream, rather than a common ancestor or independently compiled factual list, was the direct source.

Accordingly, `sources/upstreams.yaml` records lineage and comparison contexts without claiming direct inclusion where the evidence cannot support it.

## License and attribution boundary

The repository as a whole is released under the [MIT License](../LICENSE). `NOTICE.md` records factual overlap with public rule aggregators and their reported licenses. Common domains, IP ranges, ASNs, process names, and service identifiers can appear independently across routing projects; overlap alone is not treated as proof that a specific upstream work was copied into the current canonical product.

Company and product names remain trademarks or identifiers of their respective owners. See [`NOTICE.md`](../NOTICE.md) for the full disclaimer.
