# Ekko Rules

[中文](README.md)

A single standard routing-rules product for Subconverter and Mihomo.

## Scope

Ekko Rules follows the ACL4SSR online-preset responsibility boundary: it stores no nodes or subscription credentials, does not own ports, DNS, TUN, controller settings, or other client configuration above `proxies`, and only maintains policy groups, rulesets, order, and mappings. `sources/` is canonical; `generated/reversed-profile/` is generator-owned.

## Sole product

The repository publishes one logical product through two entry points backed by the same 59 rulesets:

- Subconverter: `generated/reversed-profile/config/ekko-rules.ini`;
- Mihomo: `generated/reversed-profile/Mihomo/reversed-template.yaml`.

No automatic latency selection, provider health probing, Full, local, or Extended variant is published, and the repository does not provide a Clash base configuration. Subconverter receives nodes from a dynamic subscription; Mihomo users must replace `PUT_YOUR_SUBSCRIPTION_URL_HERE`.

Current computed result:

| Rulesets | Segments | Groups | Rules incl. FINAL | Destination-IP rules | Missing `no-resolve` |
|---:|---:|---:|---:|---:|---:|
| 59 | 60 | 37 | 4,247 | 206 | 0 |

## AI, entertainment, and NSFW specialization

- OpenAI, Claude, and Overseas AI remain separate. Overseas AI includes Google AI, xAI, Microsoft AI, Cursor, Hugging Face, Perplexity, Poe, OpenRouter, Mistral, Groq, and similar non-Chinese services.
- Netflix, Disney+, YouTube, Max, HBO GO, Prime Video, Apple TV+, DAZN, TikTok, and other major entertainment services remain independent.
- US long-tail services share `🇺🇸 美国流媒体`; ordinary HMT media is grouped, Bilibili HMT stays independent, and Bilibili SEA belongs to Southeast Asian media.
- OneDrive and iCloud share `☁️ 云盘服务`; Instagram belongs to Social Media and Bing to Microsoft Services.
- `🔞 NSFW` uses high-confidence anchored domains without broad keywords, public suffixes, or shared cloud/CDN roots.
- Game platforms remain separate from game downloads, while music services share `🎵 音乐平台`.
- `global-web`, `academic`, `yahoo`, `community-overrides`, and `streaming-legacy` were removed. Ordinary proxy/manual-first traffic reaches `🐟 漏网之鱼`.

## Routing safety and compatibility

- Every destination-IP matcher, including `IP-CIDR`, `IP-CIDR6`, `IP-SUFFIX`, `IP-ASN`, and `GEOIP`, must carry `no-resolve`.
- `DOMAIN-KEYWORD` is forbidden under every DIRECT-default policy so brand-string lookalike domains cannot bypass proxy FINAL.
- Six late-recovery rulesets sit after `china-web/GEOIP,CN,no-resolve` and before the sole FINAL. They restore only Phase 2 first-effective matchers whose original action was DIRECT-default and would otherwise reach proxy FINAL.
- Historical proxy/manual-first rules may still reach FINAL, while current specialized rules and China GEOIP stay earlier.
- Recovery preserves historical default routing; it does not assert that every recovered domain or IP remains exclusively owned by the mapped vendor.

The immutable Phase 3 ledger remains historically closed: 3,472 DIRECT-default occurrences = 638 already covered + 2,834 residual; 2,834 = 2,737 first-effective candidates + 97 historical-shadow/non-DIRECT-owner exclusions; 2,732 emitted = 2,737 - 7 unsafe `DOMAIN-KEYWORD` entries + 2 anchored Roblox suffixes.

## Generate and validate

Python 3.12 is required:

```bash
python -m pip install -r requirements.txt
python scripts/generate_profile.py
python scripts/validate_generated.py
python scripts/generate_profile.py --check
python -m unittest discover -s tests -v
```

Generation uses same-volume staging and atomic replacement, preserving the previous output on failure. Gates validate the closed single-product layout, order, one FINAL, providers, SHA-256, sensitive content, strict CIDRs, `no-resolve`, anchored DIRECT-default rules, and the Phase 2/3 migration and recovery ledgers.

## Publication and license

The repository is licensed under the [MIT License](LICENSE). See [`NOTICE.md`](NOTICE.md) and [`docs/PROVENANCE.md`](docs/PROVENANCE.md) for source-overlap facts, trademarks, and disclaimers. External clients can anonymously fetch GitHub Raw entry points only after the repository becomes public. Visibility changes require a separate explicit human action; no repository script publishes the repository automatically.

DNS and TUN remain client responsibilities. `no-resolve` prevents destination-IP rules from actively resolving a domain for matching, but it does not replace DNS hijacking, encrypted DNS, or `strict-route`.
