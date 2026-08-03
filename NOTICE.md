# Ekko Rules Notice

Ekko Rules is distributed under the repository's [MIT License](LICENSE). This notice records the current rule-data boundary, direct attribution, trademarks, and disclaimers. It does not replace the license or constitute legal advice.

## Current product identity

Ekko Rules is an independently maintained routing product, not a mirror or repackaging of another preset. The current canonical `sources/` tree has been substantially rebuilt around one public product with its own:

- AI, development, entertainment, gaming, NSFW, advertising, mainland-domain, and fallback policy design;
- policy-group names, order, defaults, and rule-to-policy mappings;
- anchored-domain, strict-CIDR, `no-resolve`, first-match, deterministic-generation, and sensitive-content gates;
- explicit removal of generic proxy buckets, private provider overrides, unsafe keywords, shared-cloud ranges, stale rules, and non-public historical customizations.

The current product deliberately differs from the expanded profile used during initial reconstruction. Historical fixtures prove past state; they are not regenerated into the product wholesale.

Current file-rule accounting is explicit:

| Current component | Rules | Evidence boundary |
|---|---:|---|
| Classic mainland-domain pinned import | 1,482 | `china-domain-import-ledger.json` |
| Advertising pinned import | 849 | `advertising-import-ledger.json` |
| Filtered historical DIRECT-default recovery | 2,721 | immutable recovery ledger minus `public-rule-exclusions.json` |
| Current specialized, private/local, and service corpus | 1,914 | canonical rules plus migration/review history |
| **Total file rules** | **6,966** | `sources/quality-baseline.yaml` |

The 1,914-rule current specialized corpus is not claimed to be entirely newly authored. It combines reconstructed factual indicators with substantial local rebuilding, additions, deletions, retargeting, and precision corrections; the initial expanded profile did not preserve per-rule source attribution.

## Current canonical rule-data inputs

### Repository-maintained curation

Most current service rules, group mappings, ordering decisions, and security filters are maintained directly in this repository. They have been split, reduced, retargeted, merged, or newly added based on product requirements and review. Similar factual indicators—domains, IP ranges, ASNs, process names, and service identifiers—may independently appear in multiple routing projects. The globally first `author-domain` entry for `zaunekko.com` is an explicit repository-authorship display exception mapped to the default-direct mainland group, not an imported or general-service rule. The exact Steam mainland download hosts and anchored Ele.me/Alibaba mainland service roots added in ER-021, together with ER-022's reviewed mainland app, game-platform, and game-voice expansion, are likewise repository-maintained curation rather than new mechanical imports.

Six late-recovery rulesets are selected from frozen repository history to preserve only historical DIRECT-default behavior that would otherwise reach proxy FINAL. Recovery is a compatibility mechanism, not renewed proof that every historical domain or IP is currently owned by the mapped vendor. A separate public-product exclusion ledger removes provider-specific, local-institution, personal, scripting, mirror, and unofficial-content entries from current publication while leaving immutable historical evidence intact.

### Pinned MIT imports

Two one-time deterministic imports use the same pinned revision of [`v2fly/domain-list-community`](https://github.com/v2fly/domain-list-community/tree/660198a50bac2ab10c567d95a472a7b33915d1b0), licensed under MIT (`Copyright (c) 2018-2019 V2Ray`):

| Canonical output | Selection boundary | Frozen evidence |
|---|---|---|
| `sources/rules/china-domains-direct.list` | 1,482 anchored `DOMAIN`/`DOMAIN-SUFFIX` entries selected from 31 named mainland service categories; includes, `!cn`, keyword, regexp, single-label, and earlier-covered entries excluded | `tests/fixtures/china-domain-import-ledger.json` |
| `sources/rules/advertising.list` | 849 anchored entries resolved from `category-ads` using pinned include/attribute semantics; the sole regexp and all non-anchored forms excluded | `tests/fixtures/advertising-import-ledger.json` |

`category-ads-all` is intentionally not imported because it also includes advertising providers, analytics, messaging, and other broader service roots with a larger false-positive boundary. Normal generation reads only committed canonical files and performs no upstream fetch or GEOSITE compilation.

Only sources that directly contribute to the current canonical product are attributed above. Earlier reconstruction comparisons remain internal audit evidence and are not presented as current product inputs or dependencies.

## Trademarks and service names

Apple, Microsoft, Google, OpenAI, Claude, Netflix, Disney+, YouTube, HBO, Roblox, Bilibili, iQIYI, npm, Node.js, and all other company, product, and service names are trademarks or identifiers of their respective owners. Their appearance describes routing categories and does not imply affiliation, endorsement, or sponsorship.

## Operational disclaimer

Rules, network ownership, advertising infrastructure, and service domains can change. Advertising blocking may affect telemetry, attribution, login, playback, purchases, notifications, or other application behavior; users can manually change the advertising policy from `REJECT` when necessary. Users must review generated configurations for their jurisdiction, subscriptions, privacy requirements, and network environment.

The project does not provide nodes, subscriptions, DNS, TUN, system-proxy, or routing-service operation. The software and data are provided without warranty under the MIT License.

Repository publication, tagging, or release remains a separate explicit operation; no project script changes GitHub visibility or publishes content automatically.
