# Ekko Rules

[中文](README.md)

A single standard routing-rules product for Subconverter and Mihomo. This directory is generated deterministically from canonical repository sources and contains no proxy nodes, passwords, UUIDs, keys, or real subscription URLs.

## Entry points

- `config/ekko-rules.ini`: Online Subconverter preset without a Clash base override.
- `Mihomo/reversed-template.yaml`: Mihomo template; replace the subscription URL placeholder before use.
- `Ruleset/*.list` and `Providers/Ruleset/*.yaml`: The shared rules consumed by both entry points.
- `analysis.json` and `manifest.json`: Quality metrics and the SHA-256 file inventory.

## Online subscription conversion

Subscription conversion combines three parts: the frontend collects inputs and submits a request; the backend fetches the real subscription and the Ekko Rules remote configuration, so its operator can know the complete token-bearing subscription URL; Ekko Rules provides only public rules, order, policy groups, and mappings and never receives or stores the user subscription. Self-hosting only the frontend while still calling a public backend does not hide that URL; protecting it requires a trusted or self-hosted conversion backend.

Open a Subconverter frontend that accepts custom remote configurations. `https://sub.v1.mk/` is recommended because it supports newer protocols such as AnyTLS. `https://acl4ssr-sub.github.io/` is a popular alternative with older protocol support and may not convert AnyTLS or other newer protocols. Supply your own node subscription, choose `Clash` as the target, and enter:

```text
https://raw.githubusercontent.com/ZaunEkko/ekko-rules/main/generated/reversed-profile/config/ekko-rules.ini
```

After pasting the complete URL, click the identical full-URL candidate shown in the dropdown; pasting it or pressing Enter alone is not sufficient. A successful selection returns the field to read-only mode while displaying the full URL. Confirm that it no longer says "Default" before generating the subscription. Do not rely only on the visible input: some frontends insert a leading space during submission, so inspect the final generated URL and require `config=https%3A...`, not `config=%20https%3A...`. If `%20` appears, delete the remote configuration, paste it again, click the complete URL candidate, regenerate, and recheck until `%20` is gone; otherwise the converter may fail to load Ekko Rules and fall back to its default preset. The backend needs the complete subscription URL to fetch nodes and perform the conversion, so it is not an anonymous relay.

Ruleset URL prefix: `https://raw.githubusercontent.com/ZaunEkko/ekko-rules/main/generated/reversed-profile/Ruleset`.

## Key routing groups

- `🛑 广告拦截` uses pinned anchored domain rules and defaults to `REJECT`, while remaining manually switchable to a node or `DIRECT`;
- OpenAI and Claude are independent; Gemini, Grok, Microsoft AI, Cursor, Figma, and international Kimi, Z.ai, Qwen, and MiniMax sites use Overseas AI; DeepSeek, Xiaohongshu, and mainland Chinese AI sites use the default-direct mainland group;
- YouTube, Netflix, Disney+, Apple TV+, HBO GO/MAX, Prime Video, and DAZN are handled separately; HBO GO and Max share one group, while DAZN remains independent;
- US long-tail services use `🎬 美国流媒体`; HMT, Bilibili HMT, Southeast Asia, Japan, Korea, and mainland media are handled separately;
- game platforms are separate from game downloads; social, messaging, Discord, and email are separated;
- `🖥️ 远程串流` defaults to `DIRECT` for Tailscale, ZeroTier, Moonlight, Sunshine, Parsec, RustDesk, AnyDesk, TeamViewer, NetBird, Chrome Remote Desktop, Steam Link, and Microsoft RDP so high-volume remote access does not traverse a proxy unnecessarily;
- `🧑‍💻 开发服务` lists `♻️ 手动切换` first and covers mainstream developer sites, APIs, registries, and downloads; it can be switched temporarily to `DIRECT`;
- `☁️ 国内云服务` defaults to `DIRECT` for domestic cloud websites, consoles, APIs, object storage, and CDNs; `☁️ 海外云服务` defaults to `♻️ 手动切换` for global AWS, Azure, Google Cloud, Cloudflare, DigitalOcean, Vultr, Linode/Akamai, Oracle Cloud, and overseas regional endpoints from mainland cloud vendors; advertising and concrete business rules remain earlier;
- music, cloud storage, Microsoft, Apple, Google, and mainland Chinese sites have dedicated groups; `🔞 NSFW` defaults to `REJECT` while remaining manually switchable to a node or `DIRECT`;
- unmatched traffic reaches `🐟 漏网之鱼`.

All 40 policy groups remain manually switchable and automatic latency testing is disabled; `🛑 广告拦截` and `🔞 NSFW` default to `REJECT`. If blocking affects an app feature, temporarily switch the advertising group to `DIRECT` or another policy.

## Mainland domains, IPs, and DNS

The terminal routing order is fixed as:

```text
all concrete business rules
→ five non-Microsoft late-recovery rulesets
→ overseas cloud → domestic cloud
→ Microsoft and its late recovery → Google
→ classic mainland-domain rules
→ GEOIP,CN,DIRECT,no-resolve
→ MATCH,🐟 漏网之鱼
```

The classic domain layer uses only `DOMAIN` and `DOMAIN-SUFFIX` entries selected from a pinned source revision. It uses no `GEOSITE`, `DOMAIN-KEYWORD`, regular expression, or single-label/public-suffix catchall. Matches use `🌏 国内网站`, whose default action is `DIRECT`.

The terminal GEOIP rule supplements this with mainland destination-IP classification. `no-resolve` prevents the matcher from initiating DNS resolution but still allows it to evaluate an already-known destination IP. Every destination-IP rule retains `no-resolve`; unmatched traffic reaches `🐟 漏网之鱼`.

The sole product contains 63 rulesets, 64 segments, and 40 proxy groups. No automatic-latency, Full, local, or Extended variant is published.
