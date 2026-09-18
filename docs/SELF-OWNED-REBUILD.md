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

Two first-party evidence sources feed the same per-host review. Neither admits a rule on its own.

`scripts/rule_evidence.py` turns a traffic observation capture into reviewable evidence: where each host was seen, how many unrelated sites requested it, whether it is first-party to any of them, and how it resolves. Captures live in `docs/evidence/observation-<date>.json`.

`scripts/ads_txt_evidence.py` collects IAB ads.txt files. A publisher serves the file from its own root listing every advertising system it authorises to sell inventory, so each line is the publisher's own statement that a domain is advertising infrastructure. Declarations live in `docs/evidence/ads-txt-<date>.json`.

A declaration names the company selling inventory, which is often not the domain that delivers advertising at runtime — OpenX declares `openx.com` but bids from `openx.net`. `scripts/ad_serving_probe.py` closes that gap by resolving the delivery-shaped hostnames an advertising platform conventionally runs beneath a candidate root. A root with live delivery infrastructure earns a rule that does something; a root answering only on its apex is a corporate website and is excluded.

```
python scripts/rule_evidence.py docs/evidence/observation-2026-09-19.json evidence.json
python scripts/ads_txt_evidence.py docs/evidence/publishers-2026-09-19.txt declarations.json
python scripts/ad_serving_probe.py docs/evidence/adstxt-candidates-2026-09-19.txt probe.json
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

`advertising-curated` carries 327 rules, all derived from this repository's own evidence. Against the same evidence, coverage of hosts reviewed as advertising went from 16.4 percent with the pinned import alone to 99.1 percent; coverage of advertising systems declared by two or more publishers went from 1.7 to 51.2 percent. First-match coverage is unchanged throughout.

The pinned imports and their ledgers remain untouched, so the `Copyright (c) 2018-2019 V2Ray` attribution still stands. It can only be retired once the imports no longer ship.

Remaining work to reach that point:

| Target | Remaining |
|---|---|
| `advertising.list` (849) | the curated segment now outperforms it on every measured axis, but retiring it needs a coverage comparison over its own 849 entries: which are still live, still relevant to this audience, and not already covered here. That audit is mechanical and is the next round. |
| `china-domains-direct.list` (1,403 load-bearing) | not observable by browsing, and ads.txt has no equivalent — it answers "which services belong on DIRECT". It needs a vendor-documentation pass per service category, the method ER-023 used for cloud endpoints. |

Each batch lands as its own ER with its evidence committed alongside. The segment budget for the eventual swap is already available: retiring an import frees the segment it occupies.
