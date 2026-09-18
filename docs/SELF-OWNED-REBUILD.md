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

Thirteen origins: sina, 163, ifeng, csdn, zhihu, jd, bilibili, sohu, youku, theguardian, forbes, imdb, speedtest.

- 251 distinct hostnames, 169 third-party, across 92 registrable roots
- 9 roots appeared on two or more unrelated sites

## Round 2 — 2026-09-19

Eight further origins covering categories round 1 missed — tech news, casual gaming, mainland and international video, weather, and long-form news: ithome, 4399, v.qq, techcrunch, bbc, weather, cnbeta, mgtv.

Twenty-one origins in total:

- 387 distinct hostnames, 259 third-party, across 141 registrable roots
- every host resolved
- 20 roots on two or more unrelated sites, 9 on three or more

### Cross-site reach is not a safe admission criterion

Round 1 showed this qualitatively. Round 2 measures it. Of the 20 roots reaching two or more sites, seven carry functional traffic that a `REJECT` would break:

| Root | Sites | Why it must not be blocked |
|---|---:|---|
| `googleapis.com` | 3 | platform and Firebase APIs |
| `google.com` | 4 | reCAPTCHA challenge delivery |
| `gstatic.com` | 2 | reCAPTCHA and shared static assets |
| `baidu.com` | 4 | mainland platform APIs share the root with `hm.baidu.com` analytics |
| `qq.com` | 2 | login, payment, and platform APIs share the root with beacon hosts |
| `126.net` | 2 | NetEase captcha and CDN |
| `speedcurve.com` | 2 | performance monitoring, not ad delivery |

That is a 35 percent false-positive rate at root granularity. The remaining thirteen — `amazon-adsystem.com`, `doubleclick.net`, `googletagmanager.com`, `criteo.com`, `baidustatic.com`, `id5-sync.com`, `eu-1-id5-sync.com`, `adnxs.com`, `doubleverify.com`, `dv.tech`, `media.net`, `rubiconproject.com`, `scorecardresearch.com` — are advertising or measurement infrastructure, but that determination is a reviewer's judgement, not an output of the reach data.

Two consequences. Admission must be per-host, not per-root, because functional and advertising hosts share roots. And the judgement is manual.

### Scale

Discovery has not saturated across 21 origins: 4.2 new roots per site over the first five, 7.8 over the last five. Reaching an 849-scale candidate pool still needs on the order of 90 further origins, and every candidate then needs the review above.

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
