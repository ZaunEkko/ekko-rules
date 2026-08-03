# Ekko Rules

[中文](README.md)

A single standard routing-rules product for Subconverter and Mihomo. This directory is generated deterministically from canonical repository sources and contains no proxy nodes, passwords, UUIDs, keys, or real subscription URLs.

## Entry points

- `config/ekko-rules.ini`: Online Subconverter preset without a Clash base override.
- `Mihomo/reversed-template.yaml`: Mihomo template; replace the subscription URL placeholder before use.
- `Ruleset/*.list` and `Providers/Ruleset/*.yaml`: The shared rules consumed by both entry points.
- `analysis.json` and `manifest.json`: Quality metrics and the SHA-256 file inventory.

## Online subscription conversion

Open a Subconverter frontend that accepts custom remote configurations, such as `https://sub.v1.mk/`. Supply your own node subscription, choose `Clash` as the target, and enter:

```text
https://raw.githubusercontent.com/ZaunEkko/ekko-rules/main/generated/reversed-profile/config/ekko-rules.ini
```

Paste the complete URL, press Enter to select it, and generate the subscription. Use only a trusted conversion backend because it can normally see the original subscription URL submitted to it.

Ruleset URL prefix: `https://raw.githubusercontent.com/ZaunEkko/ekko-rules/main/generated/reversed-profile/Ruleset`.

## Key routing groups

- OpenAI and Claude are independent; Gemini, Grok, Microsoft AI, Cursor, and similar services use Overseas AI;
- YouTube, Netflix, Disney+, Apple TV+, Max, Prime Video, and other major streaming services are independent;
- US long-tail, HMT, Bilibili HMT, Southeast Asia, Japan, Korea, and mainland media are handled separately;
- game platforms are separate from game downloads; social, messaging, Discord, email, and developer services are separated;
- music, cloud storage, Microsoft, Apple, Google, NSFW, and mainland Chinese sites have dedicated groups;
- unmatched traffic reaches `🐟 漏网之鱼`.

All 37 policy groups use manual selection. Automatic latency testing is disabled.

## China IP and DNS trade-off

The generated rule is:

```text
GEOIP,CN,DIRECT,no-resolve
```

`no-resolve` reduces DNS-leak risk from extra lookups triggered by GEOIP matching, but some mainland domains may not match this rule and can take a slower route. Users who are less concerned about this risk may remove `no-resolve`, producing `GEOIP,CN,DIRECT`. Actual DNS leakage depends on the client's DNS, TUN, routing, and encrypted-DNS settings.

The sole product contains 60 rulesets, 61 segments, and 37 proxy groups. No automatic-latency, Full, local, or Extended variant is published.
