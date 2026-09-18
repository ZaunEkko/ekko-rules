# Self-owned rule rebuild

## Goal

`sources/rules/china-domains-direct.list` (1,482 rules) and `sources/rules/advertising.list` (849 rules) are one-time deterministic imports of `v2fly/domain-list-community` data at revision `660198a5`. Together they are 2,331 rules, 29.8 percent of the published corpus. While that data ships, `NOTICE.md` and the two import ledgers discharge a mandatory `Copyright (c) 2018-2019 V2Ray` attribution.

The goal of this rebuild is to replace that data with rules this repository derived itself, so the attribution can be retired because the dependency is gone — not because the notice was removed from data that is still shipping.

## Why a one-to-one replacement is the wrong target

Re-verifying the imported list entry by entry would leave the selection boundary upstream: the candidate set would still be theirs. A rebuild only counts if the candidates come from this repository's own observation.

Measurement also shows the imported set is a poor fit for this product's audience. Classifying `advertising.list` by the region its operators serve:

| Segment | Rules | Share |
|---|---:|---:|
| Russian advertising and e-commerce infrastructure | 180 | 21.2% |
| Mainland China related | 235 | 27.7% |
| International and general | 434 | 51.1% |

A fifth of the imported ad corpus is Yandex, Ozon, Wildberries, VK, Sberbank, and mail.ru infrastructure that this product's users never encounter. A self-derived list scoped to the observed audience should be smaller and more accurate, not a reproduction.

`china-domains-direct.list` cannot be shrunk the easy way. `china-geoip-direct` is a single `GEOIP,CN,no-resolve` matcher, and under fake-ip a domain-initiated connection carries a `198.18.0.0/16` destination that `no-resolve` forbids resolving, so that rule never matches domain traffic and cannot act as a safety net. First-match simulation shows only 79 of the 1,482 rules (5.3 percent) are shadowed by earlier segments; 1,403 carry real responsibility.

## Method

`scripts/rule_evidence.py` turns an observation capture into reviewable evidence. A capture maps an observed origin to the hostnames its page requested; the tool records where each host was seen, how many unrelated sites requested it, whether it is first-party to any of them, and how it resolves. It consumes no upstream rule list.

Captures live in `docs/evidence/observation-<date>.json` and are the evidence of record. Running the tool over one reproduces the derived analysis, so only the capture is committed.

```
python scripts/rule_evidence.py docs/evidence/observation-2026-09-19.json evidence.json
```

## Round 1 — 2026-09-19

Thirteen origins were observed: sina, 163, ifeng, csdn, zhihu, jd, bilibili, sohu, youku, theguardian, forbes, imdb, speedtest.

- 251 distinct hostnames, 169 of them third-party, across 92 registrable roots
- every host resolved
- 9 roots appeared on two or more unrelated sites

**Cross-site reach alone is not a safe admission criterion.** The nine cross-site roots include `googleapis.com`, `qq.com`, and `126.net`, which carry functional traffic — captcha, payment, CDN, platform APIs. A `REJECT` on any of them breaks services. Reach identifies third-party infrastructure; it does not establish that the infrastructure is advertising. A second, per-host functional judgement is mandatory before a rule enters `advertising.list`.

### Scale

New roots discovered per site stays roughly flat rather than saturating: 4.5 per site over the first four origins, 8.8 over the last four. At the observed rate, reaching an 849-scale candidate pool needs on the order of 87 more origins — and that produces candidates only, before any functional judgement.

## Admission criteria

A rule enters the rebuilt `advertising.list` only when all hold:

1. the host appears in a committed observation capture;
2. it is third-party to at least one observing origin;
3. per-host review establishes the endpoint serves advertising, attribution, or behavioural tracking rather than a function the page needs;
4. the review records why a `REJECT` cannot break first-party behaviour.

Criterion 3 is the bottleneck and is not automatable from reach data.

## Status

Round 1 delivered the harness, the first capture, and the scale estimate. No rule has been added or removed yet; the two pinned imports and their ledgers are untouched, and the attribution stands.

Remaining work is the volume implied above: roughly 87 further origins for the advertising candidate pool, per-host functional review of each candidate, and a separate vendor-documentation pass for the 1,403 load-bearing mainland direct rules. Each batch should land as its own ER with its capture committed alongside.
