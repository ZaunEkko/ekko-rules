# Ekko Rules

[中文](README.md)

A single standard routing-rules product for Subconverter and Mihomo. This directory is generated deterministically from canonical repository sources and contains no proxy nodes, passwords, UUIDs, keys, or real subscription URLs.

## Entry points

- `config/ekko-rules.ini`: Online Subconverter preset without a Clash base override.
- `Mihomo/reversed-template.yaml`: Mihomo template; replace the subscription URL placeholder before use.
- `Ruleset/*.list` and `Providers/Ruleset/*.yaml`: The shared rules consumed by both entry points.
- `analysis.json` and `manifest.json`: Quality metrics and the SHA-256 file inventory.

Ruleset URL prefix: `https://raw.githubusercontent.com/ZaunEkko/ekko-rules/main/generated/reversed-profile/Ruleset`.

## Behavior

- The sole product contains 59 rulesets, 60 segments, and 37 proxy groups. No automatic-latency, Full, local, or Extended variant is published.
- OpenAI, Claude, Overseas AI, major streaming, games, and NSFW remain specialized.
- Six late-recovery rulesets restore only historical DIRECT-default routing; every DIRECT-default domain rule must use an anchored matcher.
- Every destination-IP rule carries `no-resolve`; DNS, TUN, Hosts, and credentials remain client-owned.
