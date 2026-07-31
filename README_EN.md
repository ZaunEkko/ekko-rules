# Ekko Rules

[中文](README.md)

Reusable routing rules and subscription templates for Subconverter and Mihomo.

## Scope

Ekko Rules follows the ACL4SSR online-preset responsibility boundary: it stores no nodes or subscription credentials, does not own ports, DNS, TUN, or controller settings above `proxies`, and only maintains policy groups, rulesets, order, and mappings. `sources/` is canonical; `generated/reversed-profile/` is generator-owned.

## Core and Extended

| Product | Rulesets / Segments / Groups | Contents | Base |
|---|---:|---|---:|
| Core | 51 / 52 / 44 | Default service rules without personal/community, legacy, or brand-defense optional layers | No |
| Core Full | 51 / 52 / 44 | Core plus the sanitized repository base | Yes |
| Extended | 57 / 58 / 45 | Core plus Emby community, Spotify legacy, Qobuz defense, community, and historical streaming | No |

Subconverter:

- `config/ekko-rules.ini`: online Core;
- `config/ekko-rules-full.ini`: Core plus base;
- `config/ekko-rules-local.ini`: local Core;
- `config/ekko-rules-extended.ini`: online Extended;
- `config/ekko-rules-extended-local.ini`: local Extended.

Mihomo:

- `Mihomo/reversed-template.yaml`: Core;
- `Mihomo/reversed-template-extended.yaml`: Extended.

## Phase 2 classification

- Messaging is split into LINE, Kakao, WhatsApp, and Telegram while retaining the shared `📲 聊天软件` policy.
- Music is split into Tidal, Spotify, Qobuz, and Apple Music; non-contiguous optional segments preserve Extended first-match order.
- Minimal `🧠 AI 服务`, `🗣 社交媒体`, and `🧑‍💻 开发服务` policy groups are added.
- Router, connectivity, and reserved-address rules move to `private` targeting `DIRECT`.
- Shared CDN/cloud/vendor roots no longer bind early OpenAI, Claude, DAZN, or global-media policies; service-specific hosts remain.
- Complete Apple/Google brand-defense and legacy line-by-line separation remains a later independent batch and is not claimed complete.

Core has 15,412 rules and Extended has 15,518 rules, each with one FINAL. Both have 2,205 destination-IP rules, all with `no-resolve`. The closed migration ledger proves: 15,540 old file rules = 15,517 Extended + 23 explicit removals; Extended = 15,411 Core + 106 optional. Removals are limited to shared misclassification, covered duplicates, broad keywords, or phase-1 confirmed stale entries—not single network failures.

## Generate and validate

Python 3.12 is required:

```bash
python -m pip install -r requirements.txt
python scripts/generate_profile.py
python scripts/generate_profile.py --check
python scripts/validate_generated.py
python -m unittest discover -s tests -v
```

Generation uses same-volume staging and atomic replacement. Gates validate Core/Extended ordering, one FINAL, providers, SHA-256, sensitive content, strict CIDRs, `no-resolve`, before/after routing, and migration closure.

## Private repository and publication gate

The repository remains private. External clients normally cannot anonymously fetch private GitHub Raw files. No unified redistribution license is granted, and nothing automatically commits, pushes, publishes, or changes visibility. Human provenance and license review remains mandatory: [`NOTICE.md`](NOTICE.md), [`docs/PROVENANCE.md`](docs/PROVENANCE.md), and [`docs/PUBLICATION-GATE.md`](docs/PUBLICATION-GATE.md).

DNS and TUN remain client responsibilities; `no-resolve` does not replace DNS hijacking, encrypted DNS, or `strict-route`.
