# Ekko Rules

[中文](README.md)

Reusable routing rules and subscription templates for Subconverter and Mihomo.

## Scope

Ekko Rules follows the ACL4SSR online-preset responsibility boundary: it stores no nodes or subscription credentials, does not own ports, DNS, TUN, or controller settings above `proxies`, and only maintains policy groups, rulesets, order, and mappings. `sources/` is canonical; `generated/reversed-profile/` is generator-owned.

## Core and Extended

| Product | Rulesets / Segments / Groups | Contents | Base |
|---|---:|---|---:|
| Core | 59 / 60 / 37 | Default AI, entertainment, NSFW, communications, vendor, and DIRECT compatibility rules | No |
| Core Full | 59 / 60 / 37 | Core plus the sanitized repository base | Yes |
| Extended | 63 / 64 / 38 | Core plus EMBY community, Spotify legacy, and Qobuz brand defense | No |

Subconverter:

- `config/ekko-rules.ini`: online Core;
- `config/ekko-rules-full.ini`: Core plus base;
- `config/ekko-rules-local.ini`: local Core;
- `config/ekko-rules-extended.ini`: online Extended;
- `config/ekko-rules-extended-local.ini`: local Extended.

Mihomo:

- `Mihomo/reversed-template.yaml`: Core;
- `Mihomo/reversed-template-extended.yaml`: Extended.

## Phase 3 specialization and reduction

- OpenAI, Claude, and Overseas AI remain separate. Overseas AI includes Google AI, xAI, Microsoft AI, Cursor, Hugging Face, Perplexity, Poe, OpenRouter, Mistral, Groq, and similar non-Chinese services.
- Netflix, Disney+, YouTube, Max, HBO GO, Prime Video, Apple TV+, DAZN, TikTok, and other major entertainment services remain independent.
- US long-tail services share `🇺🇸 美国流媒体`; ordinary HMT media is grouped, Bilibili HMT stays independent, and Bilibili SEA becomes Southeast Asian media.
- OneDrive and iCloud share `☁️ 云盘服务`; Instagram moves into Social Media and Bing into Microsoft Services.
- `🔞 NSFW` contains only 38 high-confidence `DOMAIN-SUFFIX` rules without broad keywords, public suffixes, or shared cloud/CDN roots.
- `global-web`, `academic`, `yahoo`, `community-overrides`, and `streaming-legacy` were removed entirely rather than moved into another catch-all. Ordinary traffic reaches `🐟 漏网之鱼`.
- Apple, Google, Microsoft, Netflix, global media, game platform, China media, YouTube, Bilibili HMT, iQIYI, and Japan/HMT media were rebuilt around official roots, dedicated CDN hosts, processes, and clearly owned IP space.
- Six late-recovery rulesets sit after `china-web/GEOIP,CN` and before FINAL. They restore only Phase 2 first-effective matchers whose original policy was DIRECT-default and whose Phase 3 reduction would otherwise reach proxy FINAL. Historical proxy/manual-first rules may still reach FINAL, and current specialized rules remain earlier.

Core contains 4,250 rules and Extended contains 4,348, each including one FINAL. Both contain 206 destination-IP rules, all with `no-resolve`. The Phase 3 reduction Counter remains historically closed: old Extended 15,517 = 1,549 common rules + 13,968 removals; reduced Extended 1,615 = 1,549 common rules + 66 additions. The recovery ledger then proves: 3,472 historical DIRECT-default occurrences = 638 already covered by Phase 3 + 2,834 residual; 2,834 = 2,737 first-effective candidates + 97 historical-shadow/proxy-owner exclusions; actual output 2,732 = 2,737 - 7 unsafe `DOMAIN-KEYWORD` entries + 2 Roblox suffixes anchored by official documentation. Late recovery forbids `DOMAIN-KEYWORD`, so brand-string lookalike domains continue to FINAL. Recovery preserves default routing compatibility; it does not claim that every historical domain or IP remains exclusively owned by the original vendor.

Phase 2 history remains immutable: 15,540 old file rules = Phase 2 Extended 15,517 + 23 explicit removals; Phase 2 Extended = Phase 2 Core 15,411 + 106 optional.

## Generate and validate

Python 3.12 is required:

```bash
python -m pip install -r requirements.txt
python scripts/generate_profile.py
python scripts/generate_profile.py --check
python scripts/validate_generated.py
python -m unittest discover -s tests -v
```

Generation uses same-volume staging and atomic replacement. Gates validate Core/Extended order, one FINAL, providers, SHA-256, sensitive content, strict CIDRs, `no-resolve`, migration and recovery Counter closure, and that historical DIRECT-default matchers no longer fall into proxy FINAL.

## Private repository and publication gate

The repository remains private. External clients normally cannot anonymously fetch private GitHub Raw files. No unified redistribution license is granted, and nothing automatically commits, pushes, publishes, or changes visibility. Human provenance and license review remains mandatory: [`NOTICE.md`](NOTICE.md), [`docs/PROVENANCE.md`](docs/PROVENANCE.md), and [`docs/PUBLICATION-GATE.md`](docs/PUBLICATION-GATE.md).

DNS and TUN remain client responsibilities. `no-resolve` prevents destination-IP rules from actively resolving a domain for matching, but it does not replace DNS hijacking, encrypted DNS, or `strict-route`.
