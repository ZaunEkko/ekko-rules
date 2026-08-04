# Ekko Rules

[中文](README.md)

AI, entertainment, gaming, and NSFW-specialized routing rules for Subconverter and Mihomo.

## Quick start

### Online Subconverter conversion

Open a Subconverter frontend that supports custom remote configurations:

| Frontend | Recommended use |
|---|---|
| [`https://sub.v1.mk/`](https://sub.v1.mk/) | **Recommended.** Supports newer protocols such as AnyTLS; prefer it when the subscription contains newer-protocol nodes. |
| [`https://acl4ssr-sub.github.io/`](https://acl4ssr-sub.github.io/) | A popular alternative with older protocol support; it may not convert AnyTLS and other newer protocols. |

Subscription conversion combines three separate parts:

| Part | Role and trust boundary |
|---|---|
| Conversion frontend | Provides the web form for the subscription URL, target format, and remote configuration, then submits the conversion request to a backend. |
| Conversion backend | Fetches the real subscription and the Ekko Rules remote configuration, then generates the result; **its operator can know the complete real subscription URL, including its token.** |
| Ekko Rules | Provides only public rules, order, policy groups, and mappings; it neither receives nor stores the subscription URL submitted to the conversion backend. |

Self-hosting only the frontend while continuing to call a public conversion backend does not hide the real subscription URL. Protecting it requires a trusted or self-hosted conversion backend as well.

Fill in the form as follows:

| Field | Value |
|---|---|
| Subscription URL | Your own provider or node subscription |
| Target | `Clash` |
| Remote config | The Ekko Rules Raw URL below |

```text
https://raw.githubusercontent.com/ZaunEkko/ekko-rules/main/generated/reversed-profile/config/ekko-rules.ini
```

After pasting the complete URL into the remote-configuration field, the dropdown shows a candidate containing that same full URL. **Click that URL candidate to select it**; pasting it or pressing Enter alone is not sufficient. A successful selection returns the field to read-only mode while displaying the full URL. Confirm that it no longer says "Default", then generate the subscription. **Do not rely only on whether the input field visibly contains a space; inspect the final generated custom subscription URL.** Some frontends insert a leading space while submitting the remote configuration. A correct result contains `config=https%3A%2F%2Fraw.githubusercontent.com%2FZaunEkko%2Fekko-rules%2F...%2Fekko-rules.ini`, with `https` immediately after `config=`. If it contains `config=%20https...`, `%20` is that leading space. Delete the remote configuration, paste it again, click the complete URL candidate, regenerate, and recheck until `%20` is gone. If `config=` is missing or still begins with `config=%20https...`, the converter may fail to load Ekko Rules and fall back to its default preset instead of the 38 policy groups.

> The conversion backend needs the complete subscription URL to fetch nodes and perform the conversion, so it is not an anonymous relay. Use a trusted backend or self-host the conversion backend. Never paste a token-bearing subscription URL into issues, pull requests, logs, or public chats.

### Native Mihomo template

Mihomo template URL:

```text
https://raw.githubusercontent.com/ZaunEkko/ekko-rules/main/generated/reversed-profile/Mihomo/reversed-template.yaml
```

Download the template and replace:

```text
PUT_YOUR_SUBSCRIPTION_URL_HERE
```

with your own subscription URL, then load it in a Mihomo client such as Clash Verge Rev. The template provides only the proxy provider, policy groups, rule providers, and rules. Ports, DNS, TUN, controller settings, and other client configuration remain client-owned.

## Key routing groups

Ekko Rules focuses on traffic that commonly needs a dedicated node or region:

- **Ad blocking**: `🛑 广告拦截` uses pinned anchored domain rules and defaults to `REJECT`, while remaining manually switchable to a node or `DIRECT`;
- **AI and design tools**: separate OpenAI and Claude groups; Gemini, Grok, Microsoft AI, Cursor, Hugging Face, Perplexity, Poe, OpenRouter, Mistral, Groq, Figma, and international Kimi, Z.ai, Qwen, and MiniMax sites use `🧲 海外 AI`; DeepSeek, Xiaohongshu, and mainland Chinese AI sites use the default-direct `🌏 国内网站` group;
- **Major streaming**: YouTube, Netflix, Disney+, Apple TV+, `🎬 HBO GO/MAX`, Prime Video, DAZN, and TikTok are handled separately; HBO GO and Max share one group, while DAZN remains independent;
- **Regional media**: US long-tail services use `🎬 美国流媒体`, with separate handling for HMT, Bilibili HMT, Southeast Asia, Japan, Korea, iQIYI, and mainland Chinese media;
- **Gaming**: game platforms and game downloads use separate groups;
- **Social and communication**: separate groups for social media, messaging, Discord, and email;
- **Remote streaming**: `🖥️ 远程串流` defaults to `DIRECT` for high-volume remote-access paths including Tailscale, ZeroTier, Moonlight, Sunshine, Parsec, RustDesk, AnyDesk, TeamViewer, NetBird, Chrome Remote Desktop, Steam Link, and Microsoft RDP, preventing remote desktop, game streaming, or virtual-LAN traffic from unnecessarily traversing a proxy;
- **Developer services**: `🧑‍💻 开发服务` lists `♻️ 手动切换` first and covers GitHub, GitLab, Docker/GHCR, Maven/Gradle, Node.js/npm, Python/PyPI, Rust/Cargo, Go, NuGet, RubyGems, Composer, Homebrew, CocoaPods, and their websites, APIs, registries, and downloads; switch it temporarily to `DIRECT` when proxy traffic matters;
- **Cloud infrastructure**: `☁️ 国内云服务` defaults to `DIRECT` for domestic cloud websites, consoles, APIs, object storage, and CDNs; `☁️ 海外云服务` defaults to `♻️ 手动切换` for global AWS, Azure, Google Cloud, Cloudflare, DigitalOcean, Vultr, Linode/Akamai, Oracle Cloud, and overseas regional endpoints from mainland cloud vendors; advertising and concrete business rules remain earlier;
- **Other important traffic**: music, cloud storage, Microsoft, Apple, Google, and mainland Chinese sites have dedicated groups; `🔞 NSFW` defaults to `REJECT` while remaining manually switchable to a node or `DIRECT`;
- **Fallback**: unmatched traffic reaches `🐟 漏网之鱼`.

All groups remain manually switchable and automatic latency testing is disabled; `🛑 广告拦截` and `🔞 NSFW` default to `REJECT`. If blocking affects login, playback, purchases, notifications, or telemetry in a particular app, temporarily switch `🛑 广告拦截` to `DIRECT` or another policy.

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

The classic domain layer uses `DOMAIN` and `DOMAIN-SUFFIX` entries selected from a pinned source revision to cover common mainland services without an extra DNS lookup. It uses no deprecated `GEOSITE`, `DOMAIN-KEYWORD`, regular expression, or single-label/public-suffix catchall. Matches go to `🌏 国内网站`, whose default action is `DIRECT`.

The terminal `GEOIP,CN,DIRECT,no-resolve` rule supplements this with mainland destination-IP classification. `no-resolve` prevents that matcher from initiating a DNS lookup for a domain; if the client already knows the destination IP, GEOIP can still evaluate it. A domain not covered by the classic layer, with no destination IP available at matching time, continues to `🐟 漏网之鱼`. Ekko Rules keeps `no-resolve` on every destination-IP rule and publishes no actively resolving variant.

## Routing safety

- every destination-IP rule carries `no-resolve`;
- broad `DOMAIN-KEYWORD` rules are forbidden under default-direct policies;
- the mainland-domain layer contains only anchored `DOMAIN` / `DOMAIN-SUFFIX` entries and sits after late recovery but before China GEOIP and FINAL;
- unmatched traffic reaches `🐟 漏网之鱼`.

## Feedback and rule proposals

Use the structured issue forms:

- [➕ Domain or service rule proposal](https://github.com/ZaunEkko/ekko-rules/issues/new?template=domain-addition.yml)
- [🧭 Policy-group or mapping change](https://github.com/ZaunEkko/ekko-rules/issues/new?template=policy-group-change.yml)
- [🐛 Misclassification or rule problem](https://github.com/ZaunEkko/ekko-rules/issues/new?template=routing-problem.yml)

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`SUPPORT.md`](SUPPORT.md) first. You can also ask your coding agent to read the contribution guide and prepare the issue:

```text
Read https://github.com/ZaunEkko/ekko-rules/blob/main/CONTRIBUTING.md,
then prepare an issue using the repository's issue form. Use only public domains and public evidence.
Do not read or submit subscription URLs, tokens, node addresses/ports, passwords, UUIDs,
private keys, or complete client configurations. Show me the final issue body before submitting it.
```

If credentials were already exposed, revoke or rotate them immediately; editing or deleting an issue does not make them safe again.

## Project boundary

Ekko Rules has the following responsibility boundary:

- no proxy nodes or subscription credentials are stored;
- ports, DNS, TUN, controller settings, and other client configuration remain client-owned;
- the project maintains only rules, rule order, policy groups, and rule-to-policy mappings;
- `sources/` is the sole canonical input;
- `generated/reversed-profile/` is rebuilt only by the generator.

## Development and validation

Python 3.12 is required:

```bash
python -m pip install -r requirements.txt
python scripts/generate_profile.py
python scripts/validate_generated.py
python scripts/generate_profile.py --check
python -m unittest discover -s tests -v
```

Generation uses same-volume staging and atomic replacement. Validation covers the closed generated file set, order, one FINAL, providers, SHA-256, sensitive content, strict CIDRs, `no-resolve`, anchored DIRECT-default rules, and the Phase 2/3 migration and recovery ledgers.

## License and notices

Ekko Rules is licensed under the [MIT License](LICENSE). See [`NOTICE.md`](NOTICE.md) and [`docs/PROVENANCE.md`](docs/PROVENANCE.md) for source-overlap facts, trademarks, and disclaimers.
