# Ekko Rules Notice

Ekko Rules is currently maintained as a **private research and rules-maintenance repository**.
No repository-wide redistribution license is granted at this stage, and this notice is not a
substitute for the licenses of upstream projects or individual data sources.

## Upstream lineage and comparison material

The current rules were reconstructed from an expanded profile whose original per-rule source
boundaries are not recoverable. Audit evidence shows substantial shared lineage with these
projects, pinned in `sources/upstreams.yaml`:

| Project | Pinned context | License reported by upstream | Use in this repository |
|---|---|---|---|
| ACL4SSR | current and 2023 historical snapshots | CC-BY-SA-4.0 | responsibility model, comparison, and historical lineage evidence for the Phase 3-removed `global-web` segment |
| blackmatrix7/ios_rule_script | fixed Clash corpus | GPL-2.0 | broad shared-content lineage evidence and comparison |
| Loyalsoldier/clash-rules | fixed master/release context | GPL-3.0 | comparison |
| MetaCubeX/meta-rules-dat | fixed master/meta context | GPL-3.0 | Mihomo-format and category comparison |

Content similarity does not by itself prove direct copying from a particular revision. Several
upstreams are aggregators themselves. The exact revisions, reviewed paths, license URLs, and
SHA-256 evidence hashes are recorded in `sources/upstreams.yaml` and explained in
`docs/PROVENANCE.md`.

The six late recovery rulesets add no new external source lineage. They are deterministically
selected from the repository's frozen Phase 2 evidence to preserve historical DIRECT-default
routing after the Phase 3 reduction. Their placement under Apple, Microsoft, Game Platform, China
Media, Bilibili HMT, or iQIYI policies is a compatibility mapping, not a renewed claim that every
historical domain or IP is currently or exclusively owned by that vendor. The same unresolved
upstream license and provenance obligations therefore continue to block public redistribution.

Unlicensed gists or mirrors may be cited only as historical evidence. They are not canonical
inputs, are not fetched by the build, and must not be copied into a release.

## Private-state restriction

Until `docs/PUBLICATION-GATE.md` is completed and manually approved:

- keep the GitHub repository private;
- do not advertise the generated Raw URLs as publicly consumable endpoints;
- do not add a repository-wide `LICENSE` that implies unresolved upstream compatibility;
- do not publish, redistribute, mirror, or package the rules as a public release;
- do not automatically change repository visibility, commit, or push.

This is a factual project notice, not legal advice.
