# Provenance

## Current canonical product

The sanitized `sources/` tree is the sole normal-generation input. Generation is offline and does not fetch upstream projects, Git history, DNS, or an MMDB. The current manifest defines one standard product with 63 rule files, 64 ordered segments including FINAL, 40 proxy groups, and 7,282 rules including FINAL. Subconverter and Mihomo consume the same ordered corpus through one entry point each.

The product contains 206 destination-IP matchers, all with `no-resolve`. It publishes no automatic-latency group, proxy-provider health probe, Full/local preset, Extended variant, or repository-owned Clash base configuration.

## How the current product differs from reconstruction history

The expanded source profile used for initial reconstruction was evidence for recovering order and broad behavior, not a permanent product specification. Current Ekko Rules has since been materially changed through:

- removal of `global-web`, `academic`, `yahoo`, community overrides, streaming legacy, optional products, broad shared-cloud ranges, unsafe keywords, stale domains, and invalid CIDRs;
- independent AI, development, entertainment, gaming, domestic/overseas cloud, NSFW, advertising, mainland-domain, and fallback group design;
- rebuilt Apple, Google, Microsoft, Netflix, media, gaming, China, and other service corpora;
- merged, renamed, reordered, and default-adjusted policy groups;
- new anchored rules for current services such as overseas AI, Node.js/npm, US media, and user-confirmed NSFW services;
- removal of the private `huaikhwang.central-world.org` provider override and 11 high-confidence local, personal, scripting, mirror, or unofficial-content recovery entries.

Accordingly, the historical expanded profile should not be described as the current product's complete rule source. Current publication is the committed and reviewed canonical tree, constrained by tests, ledgers, and generation gates.

## Current rule accounting

The 7,281 file rules are partitioned by evidence boundary:

| Component | Rules | Provenance treatment |
|---|---:|---|
| Classic mainland-domain import | 1,482 | Direct pinned MIT input with immutable selection ledger |
| Advertising import | 849 | Direct pinned MIT input with immutable selection and capture ledgers |
| Current late recovery | 2,721 | Frozen historical recovery emission minus 11 explicit public-product exclusions |
| Specialized, private/local, and service corpus | 2,229 | Current canonical curation; combines reconstructed factual indicators with subsequent independent rebuilding and additions |

The final 2,229-rule category is not a claim of wholly original authorship or a single upstream. Original per-rule source boundaries were not recoverable. It identifies rules whose current inclusion, order, target, and maintenance are governed directly by this repository rather than one of the two pinned import pipelines or the frozen recovery selection.

## Direct canonical inputs

### Repository-maintained rules and policy

Most current rules, targets, group structure, ordering, and filters are maintained directly by Ekko Rules. Factual indicators may overlap other public corpora without proving direct copying. Product decisions—including group boundaries, rule placement, first-match priority, default `REJECT` behavior, and removals—are local work. The one-rule `author-domain` segment is an explicit user-requested authorship-display exception: `zaunekko.com` is first globally and maps to the default-direct mainland group; it is not presented as an upstream import or general service corpus. ER-021's two exact Steam mainland download hosts and five anchored Ele.me/Alibaba mainland service roots, ER-022's reviewed mainland app, game-platform, and game-voice expansion, and ER-023's region-aware cloud corpus are repository-maintained curation rather than additional mechanical upstream imports. ER-023 uses current official endpoint documentation and community categorization as review evidence, but normal generation consumes only committed canonical rules and performs no upstream fetch.

Six late-recovery rulesets derive from frozen Phase 2 repository evidence. They restore historical DIRECT-default behavior after the Phase 3 reduction, but do not reassert current vendor ownership. `tests/fixtures/public-rule-exclusions.json` further removes non-general entries from the public product while immutable Phase 2/3 fixtures and `phase-3-recovery-ledger.json` remain unchanged as historical evidence.

### Classic mainland-domain import

`sources/rules/china-domains-direct.list` is a one-time deterministic import from `v2fly/domain-list-community` revision `660198a50bac2ab10c567d95a472a7b33915d1b0`, licensed under MIT (`Copyright (c) 2018-2019 V2Ray`).

The selection reads direct `domain` and `full` entries from 31 named mainland service categories without recursively expanding includes. It excludes `!cn` entries, keywords, regular expressions, single-label suffixes, coverage within the selected bundle, and matchers already covered by earlier canonical rules.

The emitted file contains 1,482 anchored matchers: 1,481 `DOMAIN-SUFFIX` entries and one `DOMAIN` entry. Revision, category list, input hashes, counts, output digest, and license digest are frozen in `tests/fixtures/china-domain-import-ledger.json`.

### Advertising import

`sources/rules/advertising.list` is a one-time deterministic import from `category-ads` at the same pinned MIT revision. The import reproduces the upstream parser's include and attribute-filter semantics, including selective `@ads` includes, and then applies Ekko Rules' anchored-rule boundary.

The upstream category resolves to 850 entries: 677 domain roots, 172 exact full domains, and one regexp. The regexp is excluded; the emitted file contains 849 anchored matchers—677 `DOMAIN-SUFFIX` and 172 `DOMAIN`—with no keyword, regexp, single-label, or destination-IP rules.

`category-ads-all` is deliberately excluded because it additionally pulls provider-company, analytics, messaging, and other broader service roots. Input/dependency hashes, parser hash, selection counts, output hash, and representative cases are frozen in `tests/fixtures/advertising-import-ledger.json`.

Advertising precedes specialized service segments, so 40 later telemetry/advertising matchers intentionally become unreachable. That exact capture set is frozen in `tests/fixtures/advertising-routing-ledger.json`; any additional capture requires review. The independent `🛑 广告拦截` group defaults to `REJECT` but remains manually switchable.

### Domestic and overseas cloud routing

ER-023 adds repository-maintained `china-cloud` and `overseas-cloud` rulesets. Advertising, AI, development, gaming, media, cloud-storage, Apple, and concrete late-recovery service endpoints remain earlier. International Alibaba OSS, Tencent COS, and Huawei Cloud regional endpoints are listed before broad mainland vendor roots; AWS China, Azure China, and Cloudflare China use the default-DIRECT domestic cloud group. Global AWS, Azure, Google Cloud, Cloudflare, DigitalOcean, Vultr, Linode/Akamai, and Oracle Cloud infrastructure uses the manually selected overseas cloud group.

No cloud CIDR, ASN, `GEOSITE`, regular expression, or broad consumer-company root is added. The 57 intentional later-rule captures created by the cloud ownership layer are frozen in `tests/fixtures/cloud-routing-ledger.json`; concrete business rules such as Tencent GME, Epic downloads, GitHub S3, Google AI, YouTube, OpenAI Azure, and Bilibili's Kingsoft hosts remain ahead of the cloud layer.

## Immutable reconstruction and compatibility evidence

The one-time reconstruction was cross-checked against original Subconverter presets, Mihomo providers, rule order, and `.list` files before `sources/` became canonical. The Phase 2 before/after fixtures and migration ledger preserve that state without treating current generated products as source evidence.

Phase 3 evidence remains layered and immutable:

- `phase-3-after.json` preserves the 1,615-rule historical Extended reduction before compatibility recovery;
- `phase-3-migration-ledger.json` proves that reduction against frozen Phase 2 state;
- `phase-3-recovery-ledger.json` derives 2,737 first-effective DIRECT-default candidates from frozen Phase 2 history at `8dbf3e6f7c2aedfa0fd9c485f63d76c1ace31faf`;
- its security filter excludes seven historical `DOMAIN-KEYWORD` candidates and adds anchored `roblox.com` and `rbxcdn.com`, yielding 2,732 historical recovery emissions;
- `public-rule-exclusions.json` then removes 11 high-confidence non-general recovery entries from current publication without rewriting the historical ledger.

Recovery is compatibility evidence, not renewed evidence that each recovered domain or IP remains current, official, or exclusively owned by its mapped vendor.

## Limits of historical evidence

The original expanded profile did not preserve:

- one original repository and revision for every matcher;
- upstream file boundaries inside contiguous target segments;
- the converter's exact node-filter expressions;
- proxy node names, addresses, ports, passwords, keys, or subscription URL;
- provider-specific DNS, TUN, Hosts, or other client settings;
- proof that one aggregate upstream, rather than a common ancestor or independently compiled factual list, supplied every overlapping indicator.

For this reason, the reconstruction record does not claim one complete external source for the current corpus. Current direct imports are identified explicitly with pinned revisions, licenses, selection policies, and output hashes.

## License and attribution boundary

The repository as a whole is released under the [MIT License](../LICENSE). [`NOTICE.md`](../NOTICE.md) records current direct inputs, trademarks, and disclaimers. Company and product names remain trademarks or identifiers of their respective owners.
