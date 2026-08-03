# Ekko Rules

[中文](README.md)

AI, entertainment, gaming, and NSFW-specialized routing rules for Subconverter and Mihomo.

## Quick start

### Online Subconverter conversion

Open a Subconverter frontend that supports custom remote configurations, for example:

```text
https://sub.v1.mk/
```

Fill in the form as follows:

| Field | Value |
|---|---|
| Subscription URL | Your own provider or node subscription |
| Target | `Clash` |
| Remote config | The Ekko Rules Raw URL below |

```text
https://raw.githubusercontent.com/ZaunEkko/ekko-rules/main/generated/reversed-profile/config/ekko-rules.ini
```

After pasting the complete URL into the remote-configuration field, the dropdown shows a candidate containing that same full URL. **Click that URL candidate to select it**; pasting it or pressing Enter alone is not sufficient. A successful selection returns the field to read-only mode while displaying the full URL. Confirm that it no longer says "Default", then generate the subscription. **Do not rely only on whether the input field visibly contains a space; inspect the final generated custom subscription URL.** Some frontends insert a leading space while submitting the remote configuration. A correct result contains `config=https%3A%2F%2Fraw.githubusercontent.com%2FZaunEkko%2Fekko-rules%2F...%2Fekko-rules.ini`, with `https` immediately after `config=`. If it contains `config=%20https...`, `%20` is that leading space. Delete the remote configuration, paste it again, click the complete URL candidate, regenerate, and recheck until `%20` is gone. If `config=` is missing or still begins with `config=%20https...`, the converter may fail to load Ekko Rules and fall back to its default preset instead of the 36 policy groups.

> A third-party conversion backend can normally see the original subscription URL submitted to it. Use a trusted backend or deploy Subconverter yourself. Never paste a token-bearing subscription URL into issues, pull requests, logs, or public chats.

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

- **AI**: separate OpenAI and Claude groups, plus one Overseas AI group for Gemini, Grok, Microsoft AI, Cursor, Hugging Face, Perplexity, Poe, OpenRouter, Mistral, Groq, and similar services;
- **Major streaming**: YouTube, Netflix, Disney+, Apple TV+, `🎬 HBO GO/MAX`, Prime Video, DAZN, and TikTok are handled separately; HBO GO and Max share one group, while DAZN remains independent;
- **Regional media**: US long-tail services use `🎬 美国流媒体`, with separate handling for HMT, Bilibili HMT, Southeast Asia, Japan, Korea, iQIYI, and mainland Chinese media;
- **Gaming**: game platforms and game downloads use separate groups;
- **Social and communication**: separate groups for social media, messaging, Discord, email, and developer services;
- **Other important traffic**: music, cloud storage, Microsoft, Apple, Google, NSFW, and mainland Chinese sites have dedicated groups;
- **Fallback**: unmatched traffic reaches `🐟 漏网之鱼`.

All policy groups use manual node selection. Automatic latency testing is not enabled.

## Mainland domains, IPs, and DNS

The terminal routing order is fixed as:

```text
all specialized rules
→ six late-recovery rulesets
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

## Project boundary

Ekko Rules follows the ACL4SSR online-preset responsibility boundary:

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
