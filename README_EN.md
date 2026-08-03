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

Paste the complete URL into the remote-configuration field, press Enter to select it, and generate the subscription. The conversion backend combines your subscription nodes with the Ekko Rules policy groups and rules to produce a complete Clash configuration.

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
- **Major streaming**: dedicated groups for YouTube, Netflix, Disney+, Apple TV+, Max, HBO GO, Prime Video, DAZN, and TikTok;
- **Regional media**: separate handling for US long-tail, HMT, Bilibili HMT, Southeast Asia, Japan, Korea, iQIYI, and mainland Chinese media;
- **Gaming**: game platforms and game downloads use separate groups;
- **Social and communication**: separate groups for social media, messaging, Discord, email, and developer services;
- **Other important traffic**: music, cloud storage, Microsoft, Apple, Google, NSFW, and mainland Chinese sites have dedicated groups;
- **Fallback**: unmatched traffic reaches `🐟 漏网之鱼`.

All policy groups use manual node selection. Automatic latency testing is not enabled.

## China IP and DNS trade-off

The generated Clash rule is:

```text
GEOIP,CN,DIRECT,no-resolve
```

- `DIRECT` sends matched mainland Chinese IP traffic directly;
- `no-resolve` stops the GEOIP matcher from initiating an extra DNS lookup for a domain, reducing DNS-leak risk from that matching step;
- the trade-off is that some domain requests may not be identified as Chinese by GEOIP and can continue to later routing rules, so some mainland sites may take a slower route;
- users who are less concerned about this DNS-leak risk and prefer more domains to be classified after resolution may remove `no-resolve`, producing `GEOIP,CN,DIRECT`.

Without `no-resolve`, GEOIP matching may resolve domains through the client's active DNS path. Whether that lookup leaks depends on the client's DNS, TUN, routing, and encrypted-DNS configuration. Ekko Rules keeps `no-resolve` by default and publishes no alternate variant.

## Routing safety

- all destination-IP rules carry `no-resolve` by default;
- broad `DOMAIN-KEYWORD` rules are forbidden under default-direct policies;
- specialized rules and China GEOIP remain before the final fallback;
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
