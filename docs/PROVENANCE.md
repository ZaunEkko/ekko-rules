# Provenance

## What can be proven

The canonical source is now the sanitized `sources/` tree. Normal generation is offline and does
not fetch upstream projects, Git history, DNS, or an MMDB. Every published product is
deterministically derived from the manifest, ordered proxy groups, base configuration, and
canonical rule files. The current manifest declares 63 canonical rulesets: Core selects 59 and
Extended selects all 63. With the terminal matcher, Extended has 64 ordered segments, which stays
within the verified Subconverter external-configuration limit.

The one-time reconstruction was cross-checked against the original three Subconverter INI presets,
42 Mihomo providers, the Mihomo rule order, and the existing `.list` files before `sources/` became
canonical. `tests/fixtures/phase-2-before.json` preserves those hashes and behavior; the Phase 2
after fixture and migration ledger prove the later split without treating generated products as
source evidence.

Phase 3 evidence is deliberately layered. `phase-3-after.json` immutably preserves the 1,615-rule
Extended reduction before compatibility recovery. `phase-3-migration-ledger.json` continues to
prove that reduction. `phase-3-recovery-ledger.json` then derives 2,737 first-effective
DIRECT-default candidates from the frozen Phase 2 history at
`8dbf3e6f7c2aedfa0fd9c485f63d76c1ace31faf`. A security filter excludes all seven historical
`DOMAIN-KEYWORD` candidates and adds two anchored Roblox suffixes, leaving 2,732 matchers in six
canonical late recovery rulesets after `china-web/GEOIP,CN` and before FINAL. The Roblox
replacement is supported by Roblox's official education-network allowlist for `roblox.com` and
`rbxcdn.com`; normal generation still performs no fetch. This is historical default-routing
evidence, not renewed evidence that every recovered domain or IP is currently and exclusively
owned by the target vendor. It introduces no DNS or GeoIP database dependency.

Audit results retained as evidence:

- 13,591 of 13,919 unique local matchers appeared in the pinned blackmatrix7 Clash corpus
  (97.64%). This proves strong shared-content lineage, not direct authorship.
- Approximately 6,233 of 6,242 historical `global-web` entries matched ACL4SSR's 2023-06-04
  `Clash/ProxyGFWlist.list` in original order (about 99.86%). Phase 3 removed that generic segment;
  this remains historical aggregation-lineage evidence and is not a current build dependency.
- ACL4SSR also informed the Subconverter responsibility boundary: the core preset does not own
  ports, DNS, TUN, controller settings, or other client configuration above `proxies`.

## What cannot be recovered

The expanded source profile does not preserve:

- the original repository and revision for every individual rule;
- original upstream file boundaries inside a contiguous target segment;
- the original converter's exact node-filter expressions;
- proxy node names, addresses, ports, passwords, keys, or subscription URL;
- provider-specific DNS, TUN, Hosts, or other client configuration;
- evidence that one aggregate upstream, rather than a common ancestor, was the direct source.

Accordingly, `sources/upstreams.yaml` distinguishes `lineage` from `comparison`; it does not claim
`direct inclusion` where the evidence cannot support that statement.

## Pinned evidence

`sources/upstreams.yaml` records five reviewed contexts:

1. ACL4SSR current structure and license snapshot.
2. ACL4SSR historical `ProxyGFWlist.list` lineage snapshot.
3. blackmatrix7 Clash corpus and sample rule hash.
4. Loyalsoldier master/release context and sample release hash.
5. MetaCubeX master/meta context and sample generated rule hash.

For each record, the pinned revision prevents future upstream changes from rewriting this audit's
meaning. File hashes cover selected license or sample artifacts; they are evidence, not build
inputs.

## License boundary

The reviewed upstream declarations include CC-BY-SA-4.0, GPL-2.0, and GPL-3.0. Their compatibility,
attribution, source-offer, share-alike, and possible additional upstream obligations have not yet
been resolved for public redistribution. The repository therefore stays private and intentionally
has no unified `LICENSE`. See `NOTICE.md` and `docs/PUBLICATION-GATE.md`.
