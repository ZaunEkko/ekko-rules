# Ekko Rules

[中文](README.md)

Reusable routing rules and subscription templates for Subconverter and Mihomo. This directory is generated deterministically from sanitized in-repository canonical sources and contains no proxy nodes, passwords, UUIDs, keys, or real subscription URLs.

## Outputs

- `config/ekko-rules.ini`: Default Core online preset without a Clash base override.
- `config/ekko-rules-full.ini`: Core plus the sanitized base; it does not silently enable optional rules.
- `config/ekko-rules-local.ini`: Local Core preset with its base disabled by default.
- `config/ekko-rules-extended.ini`: Core plus optional EMBY community, Spotify legacy, and Qobuz brand-defense rules without a base override.
- `config/ekko-rules-extended-local.ini`: Local Extended preset.
- `base/GeneralClashConfig.yml`: Optional sanitized Clash base.
- `Ruleset/*.list`: Classical Subconverter rules.
- `Providers/Ruleset/*.yaml`: Classical Mihomo Rule Providers.
- `Mihomo/reversed-template.yaml`: Default Core Mihomo template.
- `Mihomo/reversed-template-extended.yaml`: Extended Mihomo template.
- `analysis.json`: Structure and quality metrics computed from canonical sources.
- `manifest.json`: Generated-file SHA-256 inventory; it does not recursively hash itself.

## Usage

1. After publication, the Ruleset URL prefix is `https://raw.githubusercontent.com/ZaunEkko/ekko-rules/main/generated/reversed-profile/Ruleset`.
2. Use `config/ekko-rules.ini` for Subconverter. Ports, DNS, TUN, and similar client settings remain externally owned.
3. Mihomo users must replace `PUT_YOUR_SUBSCRIPTION_URL_HERE` in the native template.
4. External clients normally cannot fetch GitHub Raw files anonymously while the repository is private.

## Behavior

- Core contains 59 rulesets, 60 segments, and 37 proxy groups.
- Extended contains 63 rulesets, 64 segments, and 38 proxy groups.
- OpenAI, Claude, and Overseas AI remain independent; Google, xAI, Microsoft, and developer-tool rulesets share the Overseas AI group.
- Major streaming services remain independent; US long-tail, HMT, Southeast Asian, and other global media are regionally grouped while Bilibili HMT remains independent.
- NSFW contains only 38 high-confidence domains without broad keywords, public suffixes, or shared cloud/CDN roots.
- Generic web, academic, Yahoo, personal-community, and historical-streaming rules were deleted so historical proxy/manual-first ordinary traffic reaches `🐟 漏网之鱼`.
- Six late-recovery rulesets after `china-web/GEOIP,CN` and before FINAL restore only historical DIRECT-default routing; current specialization and CN GeoIP remain earlier.
- Every destination-IP rule carries `no-resolve`; the Private layer targets `DIRECT`.
- Same-segment exact duplicates are zero; five non-strict CIDRs were deleted without guessing corrected prefixes.
- DNS, TUN, Hosts, and proxy credentials are outside the core ruleset scope.
