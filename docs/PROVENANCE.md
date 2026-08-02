# Provenance

## Current canonical product

The sanitized `sources/` tree is the sole canonical input. Normal generation is offline and does not fetch upstream projects, Git history, DNS, or an MMDB. The current manifest defines one standard product with 59 rule files, 60 ordered segments including FINAL, 37 proxy groups, and 4,247 rules including FINAL. Subconverter and Mihomo consume the same ordered rule corpus through one entry point each.

The product contains 206 destination-IP matchers, all with `no-resolve`. It publishes no automatic-latency group, proxy-provider health probe, Full/local preset, Extended variant, or repository-owned Clash base configuration.

## Reconstruction and immutable evidence

The one-time reconstruction was cross-checked against the original Subconverter presets, Mihomo providers, Mihomo rule order, and existing `.list` files before `sources/` became canonical. `tests/fixtures/phase-2-before.json`, the Phase 2 after fixture, and the migration ledger preserve that historical state without treating current generated products as source evidence.

Phase 3 evidence remains layered and immutable:

- `phase-3-after.json` preserves the 1,615-rule historical Extended reduction before compatibility recovery;
- `phase-3-migration-ledger.json` proves that reduction against the frozen Phase 2 state;
- `phase-3-recovery-ledger.json` derives 2,737 first-effective DIRECT-default candidates from frozen Phase 2 history at `8dbf3e6f7c2aedfa0fd9c485f63d76c1ace31faf`;
- the security filter excludes seven historical `DOMAIN-KEYWORD` candidates and adds the anchored `roblox.com` and `rbxcdn.com` suffixes, leaving 2,732 matchers in six late-recovery rulesets after `china-web/GEOIP,CN` and before FINAL.

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
