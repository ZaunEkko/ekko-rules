# Ekko Rules Notice

Ekko Rules is distributed under the repository's [MIT License](LICENSE). This notice records factual source-overlap, trademark, and disclaimer information; it does not replace the license or constitute legal advice.

## Rule-data context

The current rules were reconstructed from an expanded routing profile whose original per-rule source boundaries are not recoverable. Domains, IP ranges, ASNs, process names, and service names are factual routing indicators that may also appear in many public rule collections. Similarity or overlap by itself does not establish copying from a particular project or revision.

Historical audit and comparison contexts are pinned in `sources/upstreams.yaml`:

| Project | Pinned context | License reported by upstream | Use in this repository |
|---|---|---|---|
| ACL4SSR | current and 2023 historical snapshots | CC-BY-SA-4.0 | responsibility model, comparison, and historical lineage evidence for the removed `global-web` segment; its ChinaDomain data was evaluated but not imported |
| v2fly/domain-list-community | `660198a50bac2ab10c567d95a472a7b33915d1b0` | MIT | pinned one-time canonical import for the classic mainland-domain layer |
| blackmatrix7/ios_rule_script | fixed Clash corpus | GPL-2.0 | broad shared-content lineage evidence and comparison |
| Loyalsoldier/clash-rules | fixed master/release context | GPL-3.0 | comparison |
| MetaCubeX/meta-rules-dat | fixed master/meta context | GPL-3.0 | Mihomo-format and category comparison |

These projects are not runtime or build dependencies. Normal generation reads only canonical repository sources and does not fetch them. Exact revisions, reviewed paths, URLs, and SHA-256 evidence hashes are documented in `sources/upstreams.yaml` and [`docs/PROVENANCE.md`](docs/PROVENANCE.md).

The six late-recovery rulesets add no new external input. They are deterministically selected from frozen Phase 2 repository evidence to preserve historical DIRECT-default routing after Phase 3 reduction. Mapping a recovered matcher to Apple, Microsoft, Game Platform, China Media, Bilibili HMT, or iQIYI is a compatibility decision, not a renewed claim that every historical domain or IP is currently or exclusively owned by that vendor.

The classic mainland-domain layer is a deterministic filtered import from the pinned `v2fly/domain-list-community` revision. It contains only anchored `DOMAIN` and `DOMAIN-SUFFIX` entries selected from 31 named mainland service categories; includes, `!cn` entries, keywords, regular expressions, single-label suffixes, and entries covered by earlier canonical rules are excluded. The upstream MIT notice states `Copyright (c) 2018-2019 V2Ray`. The import evidence is frozen in `tests/fixtures/china-domain-import-ledger.json`; normal generation does not fetch the upstream. ACL4SSR's CC-BY-SA ChinaDomain corpus was evaluated but not imported, avoiding a mixed-license ShareAlike component.

Unlicensed gists or mirrors may be retained as historical evidence only. They are not canonical generator inputs and are not fetched by the build.

## Trademarks and service names

Apple, Microsoft, Google, OpenAI, Claude, Netflix, Disney+, YouTube, HBO, Roblox, Bilibili, iQIYI, and all other company, product, and service names are trademarks or identifiers of their respective owners. Their appearance describes routing categories and does not imply affiliation, endorsement, or sponsorship.

## Operational disclaimer

Rules and network ownership can become outdated. Users must review the generated configuration for their jurisdiction, subscriptions, privacy requirements, and network environment. The project does not provide nodes, subscriptions, DNS, TUN, system-proxy, or routing-service operation. The software and data are provided without warranty under the MIT License.

Repository publication, tagging, or release remains a separate explicit operation; no project script changes GitHub visibility or publishes content automatically.
