# Self-owned rule rebuild

## Goal

`sources/rules/china-domains-direct.list` (1,482 rules) and `sources/rules/advertising.list` (849 rules) were one-time deterministic imports of `v2fly/domain-list-community` data at revision `660198a5`. Together they were 2,331 rules, 29.8 percent of the published corpus, and while they shipped, `NOTICE.md` and the two import ledgers discharged a mandatory `Copyright (c) 2018-2019 V2Ray` attribution.

The goal of this rebuild was to replace that data with rules this repository derived itself, so the attribution could be retired because the dependency was gone — not because the notice was removed from data that was still shipping.

**ER-047 completed it.** Both imports are deleted, their ledgers with them, and `NOTICE.md` no longer carries the attribution. What follows records how that was reached, including where the method stopped.

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

A rule enters `advertising-curated` only when all hold:

1. the host is reached by one of this repository's committed evidence routes: a traffic observation capture, a markup and script scan, a publisher `ads.txt` declaration confirmed by the delivery probe, or Certificate Transparency confirmed by the APNIC probe;
2. it is **either** third-party to at least one observing origin, **or** a dedicated advertising or tracking endpoint of the operator whose site referenced it;
3. per-host review establishes the endpoint serves advertising, attribution, or behavioural tracking rather than a function the page needs;
4. the review records why a `REJECT` cannot break first-party behaviour.

Criterion 1 read "the host appears in a committed observation capture" until ER-051. Traffic observation was the first route this repository built, and the wording froze it as the only one, which the corpus never matched: 421 of the shipped advertising rules arrive through the `ads.txt` declaration and delivery-probe route documented under Method, and most of `china-web` arrives through Certificate Transparency and APNIC. The criterion now names every route the Method section describes.

Criterion 2 read "third-party to at least one observing origin" until ER-049. That wording came from a corpus of Western third-party ad tech, where every candidate was third-party by construction, and it does not survive contact with mainland origins: a large share of mainland advertising is served from the publisher's own `ad.` subdomain — `ad.sohu.com`, `ad.cnki.net`, `cpro.zol.com.cn` — which the original wording could never admit. Blocking a publisher's own ad subdomain is what ad blocking is.

Nothing protective was lost, because criterion 2 was never what stopped the dangerous cases. `stats.gd.gov.cn`, `report.12377.cn` and `ta.wikipedia.org` are third-party across unrelated origins and are rejected by criterion 3; `collect.mybank.cn` and `log.cmbchina.com` are rejected by criterion 4. Criterion 3 remains the bottleneck and is not automatable from reach data.

## Status — complete

Rules derived entirely from this repository's own evidence:

| Segment | Rules | Evidence |
|---|---:|---|
| `advertising-curated` | 494 | traffic capture, publisher ads.txt declarations, delivery probe |
| `china-web` | 4,219 | markup and script scans of mainland origins, Certificate Transparency vendor attestation, APNIC delegation records |
| `china-direct-curated` | 9 | the broad vendor and CDN roots, held late so they do not preempt the cloud, media and AI segments |

Measured improvement, with the retired import alone and then with the curation that replaced it:

| Target | Import | Curated |
|---|---:|---:|
| Third-party hosts observed on 21 origins | 7.3% | 42.3% |
| Hosts this repository reviewed as advertising | 16.5% | 100.0% |
| Advertising systems declared by two or more publishers | 1.3% | 44.9% |
| Hostnames observed across 2,017 mainland origins | 7.7% | 60.9% |
| Mainland origins scanned | 2.7% | 93.4% |

First-match unreachable coverage fell from 145 to 54 as the imports left, same-segment holding at 13 and cross-segment falling from 132 to 41: most dead rules in the product were theirs.

## Why the replacement is not a reproduction

Independent attestation of the imports' live entries reached 34.1 percent for the mainland list and 55.8 percent for the advertising one, and then saturated. The third crawl round confirmed 3,096 new mainland roots of which only 92 were referenced by more than one origin; a subject-alternative-name harvest added 627 rules and moved attestation 1.3 points. What the imports still held was mobile SDK endpoints, vendor backend domains and platform-native advertising hosts that neither public web traffic nor certificate logs reach from here.

So the imports were not reproduced. They were replaced by a corpus that measures better against this repository's own evidence, which is a different and defensible claim — and the reason the table above compares coverage rather than counting matched entries.

Retiring them outright would still have cost coverage for 2,504 observed hostnames, including `baidu.com`, `163.com`, `126.net`, `7fresh.com` and `jddj.com`. Those were in this repository's own observation all along; the candidate filter had skipped them precisely because the import already covered them. 239 such roots were recovered before the swap, 163 confirmed mainland-hosted by APNIC and 61 admitted by per-host review, plus 41 added explicitly, taking measured loss to zero.

One deliberate exception: `newrelic.com` is not re-added. The import blocked it; this repository's review classifies browser monitoring as neither advertising nor tracking, and the hold stands over parity.

## Committed evidence

Every published rule in the advertising and mainland segments maps to one of these, and two test classes assert it in both directions.

| File | What it holds |
|---|---|
| `admission-review-2026-09-19.json` | per-host verdicts for hosts seen in the traffic capture |
| `cn-ad-review-2026-09-19.json` | per-host verdicts for advertising and tracking hosts found in the mainland scan |
| `ad-root-review-2026-09-19.json` | root-level verdicts, each stating why no non-advertising service lives under the root, and the declared seller where the delivery domain differs |
| `ad-serving-probe-2026-09-19.json` | delivery-probe verdicts: which candidate roots actually run advertising infrastructure |
| `ads-txt-2026-09-19.json` | publisher declarations, counted at two or more publishers |
| `legacy-ad-review-2026-09-19.json` | the closed grandfathered advertising set |
| `cn-apnic-verdicts-2026-09-19.json` | APNIC verdicts for the mainland roots |
| `cn-observation-2026-09-19.json` | mainland roots the scan saw but APNIC could not adjudicate |
| `cn-legacy-direct-2026-09-19.json` | the closed grandfathered mainland set |
| `cn-review-admitted-2026-09-19.json` | the few roots neither the scan nor the probe can adjudicate, each stating which limitation applied |

`ad-vendors-2026-09-19.txt`, `adstxt-candidates-2026-09-19.txt`, `cn-candidates-2026-09-19.txt` and `cn-vendors-2026-09-19.txt` are **inputs, not evidence**. They are the seeds and candidate lists the probes adjudicate, and the vendor seed names `bytedance.com`, whose general API infrastructure is not advertising. No test may read them as a verdict.

The APNIC probe names a mainland client subnet in its query. It did not at first, and the omission made it answer the wrong question: `xinhuanet.com` returns `156.238.128.x` to this repository's own location and `117.177.70.x` to a mainland client, so the probe called a China Mobile-hosted site foreign. Geo-DNS and CDN edges are the normal case for exactly the services a mainland direct rule is about, so the fix matters more than the four verdicts it corrected. It is not total: Cloudflare answers from anycast and returns the same address whatever subnet is named, which is why `cloudflare.cn` has no verdict and why a small review-admitted category exists at all.

Two grandfathered sets exist because two groups of rules predate the rebuild and their criterion 1 evidence was never committed: 28 advertising rules from commit `78c939c` and 269 mainland rules from the repository's own early curation. Claiming an evidence route for them after the fact would be an assertion, not evidence. Both sets are closed — a test asserts each may shrink but never grow — so neither can become a route for admitting new rules.

## Status of the evidence tools

| Script | Role |
|---|---|
| `rule_evidence.py` | traffic capture to per-host evidence |
| `page_host_scan.py` | markup scan for breadth |
| `ads_txt_evidence.py` | publisher advertising-system declarations |
| `ad_serving_probe.py` | does a candidate root actually deliver advertising |
| `vendor_domain_discovery.py` | vendor domain portfolio from Certificate Transparency |
| `mainland_hosting_probe.py` | is a root served from mainland China, per APNIC |
