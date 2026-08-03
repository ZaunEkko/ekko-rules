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

## Product size

Ekko Rules publishes one standard product. Subconverter and Mihomo share the same canonical rules:

| Rulesets | Segments | Groups | Rules incl. FINAL | Destination-IP rules | Missing `no-resolve` |
|---:|---:|---:|---:|---:|---:|
| 59 | 60 | 37 | 4,247 | 206 | 0 |

No automatic latency selection, provider health probe, Full, local, or Extended variant is published, and the repository provides no Clash base configuration.

## Rule specialization

- OpenAI, Claude, and Overseas AI remain separate. Overseas AI includes Google AI, xAI, Microsoft AI, Cursor, Hugging Face, Perplexity, Poe, OpenRouter, Mistral, Groq, and similar non-Chinese services.
- Netflix, Disney+, YouTube, Max, HBO GO, Prime Video, Apple TV+, DAZN, TikTok, and other major entertainment services remain independent.
- US long-tail streaming is grouped, ordinary HMT media is grouped, Bilibili HMT remains independent, and Bilibili SEA belongs to Southeast Asian media.
- OneDrive and iCloud share Cloud Storage; Instagram belongs to Social Media and Bing to Microsoft Services.
- Game platforms remain separate from game downloads, while music services share `🎵 音乐平台`.
- `🔞 NSFW` uses high-confidence anchored domains without broad keywords, public suffixes, or shared cloud/CDN roots.
- `global-web`, `academic`, `yahoo`, `community-overrides`, and `streaming-legacy` were removed. Ordinary proxy/manual-first traffic reaches `🐟 漏网之鱼`.

## Routing safety

- Every destination-IP matcher, including `IP-CIDR`, `IP-CIDR6`, `IP-SUFFIX`, `IP-ASN`, and `GEOIP`, must carry `no-resolve`.
- `DOMAIN-KEYWORD` is forbidden under every DIRECT-default policy so brand-string lookalike domains cannot bypass proxy FINAL.
- Six late-recovery rulesets sit after `china-web/GEOIP,CN,no-resolve` and before the sole FINAL. They restore only historical first-effective DIRECT-default matchers that would otherwise reach proxy FINAL.
- Historical proxy/manual-first rules may still reach FINAL, while current specialized rules and China GEOIP remain earlier.
- Recovery preserves historical default routing and does not assert current ownership of every recovered domain or IP.

`no-resolve` prevents destination-IP rules from actively resolving a domain for matching, but it does not replace client-side DNS hijacking, encrypted DNS, TUN, or `strict-route` configuration.

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
