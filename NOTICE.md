# Ekko Rules Notice

Ekko Rules is distributed under the repository's [MIT License](LICENSE). This notice records what this product owes to anyone else: attribution, trademarks, and disclaimers. It does not replace the license or constitute legal advice.

## Current product identity

Ekko Rules is an independently maintained routing product, not a mirror or repackaging of another preset. It has its own:

- AI, development, entertainment, gaming, finance, domestic/overseas cloud, NSFW, advertising, mainland-domain, and fallback policy design;
- policy-group names, order, defaults, and rule-to-policy mappings;
- anchored-domain, strict-CIDR, `no-resolve`, first-match, deterministic-generation, and sensitive-content gates.

Rule counts, evidence boundaries and the per-category accounting live in [`docs/PROVENANCE.md`](docs/PROVENANCE.md), which is checked against the canonical sources by the test suite. They are not repeated here: this file carried a second copy of that accounting for several product generations, nobody reconciled it, and it drifted to describing a corpus roughly a third smaller than the one being published. One place, checked, is worth more than two places agreeing by luck.

## Attribution

**No rule in the current product derives from a third-party rule list.**

Rules are derived from this repository's own evidence — traffic observation, publisher `ads.txt` declarations, Certificate Transparency logs, and APNIC delegation records — with method and records in [`docs/SELF-OWNED-REBUILD.md`](docs/SELF-OWNED-REBUILD.md) and [`docs/evidence/`](docs/evidence/).

Similar factual indicators — domains, IP ranges, ASNs, process names, service identifiers — may independently appear in other routing projects. That is convergence on the same public facts, not derivation.

Six late-recovery rulesets are selected from frozen repository history to preserve historical DIRECT-default behaviour that would otherwise reach the proxy fallback. Recovery is a compatibility mechanism, not renewed proof that every historical domain or IP is currently owned by the mapped vendor.

## Third-party remote configs referenced by the self-hosted converter

The converter in `selfhost/` can be pointed at remote configuration templates that are **not** part of this product's rule data. It ships references only: no third-party file is copied into this repository, redistributed, or modified, and each file is fetched at request time from its own project's servers by the operator's own deployment.

| Referenced project | What is referenced | License |
|---|---|---|
| [ACL4SSR](https://github.com/ACL4SSR/ACL4SSR) | Online Subconverter configuration templates under `Clash/config/` | GPL-3.0 |

Selecting one of these replaces Ekko Rules entirely for that conversion: the groups, rules, and base template all come from the referenced project, and its availability, correctness, and licensing are that project's own. Ekko Rules remains the first and default option, and an operator may drop every third-party entry with `THIRD_PARTY_REMOTE_CONFIGS=0`. A visitor-supplied configuration URL is likewise fetched, not stored or republished.

## Trademarks and service names

Apple, Microsoft, Google, OpenAI, Claude, Netflix, Disney+, YouTube, HBO, Roblox, Bilibili, iQIYI, Wise, PayPal, HSBC, npm, Node.js, and all other company, product, and service names are trademarks or identifiers of their respective owners. Their appearance describes routing categories and does not imply affiliation, endorsement, or sponsorship.

## Operational disclaimer

Rules, network ownership, advertising infrastructure, and service domains can change. Advertising blocking may affect telemetry, attribution, login, playback, purchases, notifications, or other application behaviour; users can manually change the advertising policy from `REJECT` when necessary. Users must review generated configurations for their jurisdiction, subscriptions, privacy requirements, and network environment.

The project does not provide nodes, subscriptions, DNS, TUN, system-proxy, or routing-service operation. The software and data are provided without warranty under the MIT License.

Repository publication, tagging, or release remains a separate explicit operation; no project script changes GitHub visibility or publishes content automatically.
