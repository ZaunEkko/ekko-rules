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

Rules derived entirely from this repository's own evidence:

| Segment | Rules | Evidence |
|---|---:|---|
| `advertising-curated` | 452 | traffic capture, publisher ads.txt declarations, delivery probe |
| `china-web` additions | 2,899 | markup scan of mainland origins, Certificate Transparency vendor attestation, APNIC delegation records |

Measured improvement, with the pinned import alone and then with the import plus the curation:

| Target | Import | Import and curated |
|---|---:|---:|
| Third-party hosts observed on 21 origins | 7.3% | 42.3% |
| Hosts this repository reviewed as advertising | 16.5% | 100.0% |
| Advertising systems declared by two or more publishers | 1.3% | 44.9% |

On the mainland side the curation is purely additive. Eight major services — `zol.com.cn`, `ifeng.com`, `eastmoney.com`, `csdn.net`, `ithome.com`, `cnblogs.com`, `suning.com`, `dangdang.com` — reached the proxy fallback before it and are direct after it. First-match coverage never increased across any round.

## What retiring the imports still needs

The attribution can only be retired once the imports no longer ship, and neither can be retired yet:

| Import | Live entries | Independently attested | Still missing |
|---|---:|---:|---:|
| `china-domains-direct.list` | 1,448 | 461 (31.8%) | 987 |
| `advertising.list` | 765 | 215 (28.1%) | 550 |

The remaining mainland entries are vendor-affiliated domains under obscure names — `byte00.net`, `bdurl.net`, `jcloud-cache.net`, `360os.com` — which the Certificate Transparency method reaches as the organisation list grows. The remaining advertising entries are mobile SDK and platform-native endpoints — `app-measurement.com`, `admob.com`, `2mdn.net`, `ads-twitter.com` — plus Russian and mainland ecosystems, which need a fourth source: vendor allowlist documentation, the method ER-023 used for cloud endpoints.

Each batch lands as its own ER with its evidence committed alongside. The segment budget for either swap is already available: retiring an import frees the segment it occupies.

## Status of the evidence tools

| Script | Role |
|---|---|
| `rule_evidence.py` | traffic capture to per-host evidence |
| `page_host_scan.py` | markup scan for breadth |
| `ads_txt_evidence.py` | publisher advertising-system declarations |
| `ad_serving_probe.py` | does a candidate root actually deliver advertising |
| `vendor_domain_discovery.py` | vendor domain portfolio from Certificate Transparency |
| `mainland_hosting_probe.py` | is a root served from mainland China, per APNIC |
