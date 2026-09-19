# Provenance

## Current canonical product

The sanitized `sources/` tree is the sole normal-generation input. Generation is offline and does not fetch upstream projects, Git history, DNS, or an MMDB. The current manifest defines two builds of one product over the same corpus: 63 rule files, 64 ordered segments including FINAL, and 10,080 rules including FINAL, with 43 proxy groups in the full build and 10 in the lite build. The lite build changes only the policy a segment targets, never the rules or their order, and `LiteProductTests` holds the two to the same effective action on every segment. Subconverter and Mihomo consume the same ordered corpus through one entry point per build.

The product contains 206 destination-IP matchers, all with `no-resolve`. It publishes no automatic-latency group, proxy-provider health probe, Full/local preset, Extended variant, or repository-owned Clash base configuration.

## How the current product differs from reconstruction history

The expanded source profile used for initial reconstruction was evidence for recovering order and broad behavior, not a permanent product specification. Current Ekko Rules has since been materially changed through:

- removal of `global-web`, `academic`, `yahoo`, community overrides, streaming legacy, optional products, broad shared-cloud ranges, unsafe keywords, stale domains, and invalid CIDRs;
- independent AI, development, entertainment, gaming, domestic/overseas cloud, NSFW, advertising, mainland-domain, and fallback group design;
- rebuilt Apple, Google, Microsoft, Netflix, media, gaming, China, and other service corpora;
- merged, renamed, reordered, and default-adjusted policy groups;
- new anchored rules for current services such as overseas AI, Node.js/npm, US media, and user-confirmed NSFW services;
- removal of the private `huaikhwang.central-world.org` provider override and 11 high-confidence local, personal, scripting, mirror, or unofficial-content recovery entries.

Accordingly, the historical expanded profile should not be described as the current product's complete rule source. Current publication is the committed and reviewed canonical tree, constrained by tests, ledgers, and generation gates.

## Current rule accounting

The 10,027 file rules are partitioned by evidence boundary:

| Component | Rules | Provenance treatment |
|---|---:|---|
| Current late recovery | 2,684 | Frozen historical recovery emission minus 11 explicit public-product exclusions |
| Observation-derived mainland direct curation | 3,859 | Derived from this repository's own markup and script scans of mainland origins, Certificate Transparency vendor attestation, and APNIC delegation records |
| Observation-derived advertising curation | 590 | Derived from this repository's own traffic observation and publisher ads.txt declarations, each entry reviewed per host and verified to run live delivery infrastructure |
| Specialized, private/local, and service corpus | 2,818 | Current canonical curation; combines reconstructed factual indicators with subsequent independent rebuilding and additions |
| Overseas shopping curation | 76 | Reviewed per host: overseas retail and cross-border forwarding roots whose storefront, availability or bot challenge depends on which exit reaches them |

No component of the current product derives from a third-party rule list. ER-047 retired the two pinned `v2fly/domain-list-community` imports that once carried 2,331 rules, and with them the `Copyright (c) 2018-2019 V2Ray` attribution they required.

The final 2,794-rule category is not a claim of wholly original authorship or a single upstream. Original per-rule source boundaries were not recoverable. It identifies rules whose current inclusion, order, target, and maintenance are governed directly by this repository rather than the frozen recovery selection or one of the observation-derived pipelines.

## Direct canonical inputs

### Repository-maintained rules and policy

Most current rules, targets, group structure, ordering, and filters are maintained directly by Ekko Rules. Factual indicators may overlap other public corpora without proving direct copying. Product decisions—including group boundaries, rule placement, first-match priority, default `REJECT` behavior, and removals—are local work. The two-rule `author-domain` segment is an explicit user-requested authorship-display exception: `boxnook.cc` and `zaunekko.com`, in that order, are the first rules globally and map to the default-direct mainland group; they are not presented as an upstream import or general service corpus. ER-021's two exact Steam mainland download hosts and five anchored Ele.me/Alibaba mainland service roots, ER-022's reviewed mainland app, game-platform, and game-voice expansion, and ER-023's region-aware cloud corpus are repository-maintained curation rather than additional mechanical upstream imports. ER-023 uses current official endpoint documentation and community categorization as review evidence, but normal generation consumes only committed canonical rules and performs no upstream fetch.

Six late-recovery rulesets derive from frozen Phase 2 repository evidence. They restore historical DIRECT-default behavior after the Phase 3 reduction, but do not reassert current vendor ownership. `tests/fixtures/public-rule-exclusions.json` further removes non-general entries from the public product while immutable Phase 2/3 fixtures and `phase-3-recovery-ledger.json` remain unchanged as historical evidence.

### Observation-derived mainland direct curation

`sources/rules/china-web.list` and `sources/rules/china-direct-curated.list` carry 3,858 rules derived entirely from this repository's own measurement. `scripts/page_host_scan.py` reads the hostnames a mainland origin's markup and scripts reference, which supplies candidates but cannot decide them — a mainland page also references foreign fonts, libraries and advertising. `scripts/vendor_domain_discovery.py` reaches the backend and sub-brand domains no homepage links to, by querying Certificate Transparency for the names a vendor proved control of to a certificate authority.

The decision comes from a primary source wherever it can: APNIC publishes the registry's own delegation records, so the address ranges allocated to CN are authoritative rather than inferred, and `scripts/mainland_hosting_probe.py` admits a root when its A records fall inside them. Where that test cannot answer — a mainland service on a global CDN, or a root whose apex carries no address — admission falls back to per-host review recorded against the observation that found it.

`china-direct-curated` exists because ordering is semantics. Seven broad vendor roots plus two CDN roots must not run ahead of the cloud, media and AI segments that name specific hosts beneath them, so they sit in their own segment immediately before the GEOIP fallback, where the retired mainland import used to sit.

### Observation-derived advertising curation

`sources/rules/advertising-curated.list` is the first segment of the corpus this repository derived entirely from its own measurement. It consumes no upstream rule list. Candidates come from two first-party evidence sources committed under `docs/evidence/`: traffic captures of what observed pages actually requested, and IAB ads.txt files in which publishers themselves declare the advertising systems they authorise. Neither admits a rule alone. Traffic-observed hosts passed the per-host review recorded in `docs/evidence/admission-review-2026-09-19.json`: the host was observed third-party to a capture origin, review established it serves advertising, attribution or behavioural tracking, and review recorded why a `REJECT` cannot break first-party behaviour.

An ads.txt declaration names the company selling inventory, which is often not the domain that delivers advertising at runtime, so a declared root enters only after `scripts/ad_serving_probe.py` resolves conventional delivery hostnames beneath it and finds live infrastructure. Roots answering only on their apex are corporate websites and are excluded, as are publishers declaring themselves, mixed-business roots whose non-advertising functions a `REJECT` would break, and video and audio player platforms where blocking would remove content rather than advertising.

The segment is the whole advertising policy since ER-047 retired the pinned import; nothing sits between `private`, `remote-streaming` and it. It introduces no new first-match coverage: a curated suffix that would shadow an existing rule is narrowed to the observed hosts instead. Every published rule maps to a committed verdict — a per-host review, a root review, a publisher declaration made by two or more publishers, or a delivery-probe confirmation — and `AdvertisingAdmissionContractTests` asserts that mapping in both directions. Method, admission criteria, and the measured reasons this curation exists are in `docs/SELF-OWNED-REBUILD.md`.

Advertising precedes specialized service segments, so a small number of later telemetry and advertising matchers intentionally become unreachable; they are counted in the frozen first-match coverage figures in `sources/quality-baseline.yaml` rather than in a separate ledger, which ER-047 deleted along with the import it described. The independent `🛑 广告拦截` group defaults to `REJECT` but remains manually switchable.

### Domestic and overseas cloud routing

ER-023 adds repository-maintained `china-cloud` and `overseas-cloud` rulesets. Advertising, AI, development, gaming, media, cloud-storage, Apple, and concrete late-recovery service endpoints remain earlier. International Alibaba OSS, Tencent COS, Huawei Cloud, UCloud US3, Kingsoft KS3, and China Telecom OOS regional endpoints are listed before broad mainland vendor roots; AWS China, Azure China, and Cloudflare China use the default-DIRECT domestic cloud group. Global AWS, Azure, Google Cloud, Cloudflare, DigitalOcean, Vultr, Linode/Akamai, and Oracle Cloud infrastructure uses the manually selected overseas cloud group; the exact unified OCI Console host `cloud.oracle.com` is included without adding the broad `oracle.com` root. AWS's website and documentation under `aws.amazon.com`, canonical and regional `*.console.aws.amazon.com` hosts, sign-in flow, `api.aws` service endpoints, and Lambda Function URLs under `on.aws` use overseas cloud. BytePlus's exact console and API root represent Volcengine's international cloud without broadening to the whole consumer brand domain. Azure's current public cloud service-domain inventory—including API Management, Container Registry, IoT, containers, data and analytics, Kubernetes, machine learning, Storage, SQL, Service Bus, Redis, Search, SignalR, and Static Web Apps—uses documented infrastructure suffixes before the Microsoft aggregate; retired Azure services and Microsoft business-product roots remain excluded. Vultr Object Storage uses `vultrobjects.com`. Shared `googleapis.com` remains under the Google policy, while the official Google Cloud global API endpoint inventory plus Firebase Storage and Realtime Database management APIs are represented by exact `DOMAIN` rules; Firebase's documented `firebaseio.com` and regional `firebasedatabase.app` data endpoints, virtual-hosted Cloud Storage, and `rep.googleapis.com` regional endpoints stay in overseas cloud. The duplicate mainland `recaptcha.net` entry is removed so reCAPTCHA retains its Google policy. Huawei's international console is separated from its domestic root, and Baidu AI Cloud's primary portal and console use domestic cloud. Reviewed non-mainland Alibaba region suffixes cover both `SERVICE.REGION.aliyuncs.com` and `SERVICE-vpc.REGION.aliyuncs.com` APIs before the domestic `aliyuncs.com` catch-all; the explicit Alibaba OSS overseas acceleration suffix remains ahead as well. JD Cloud DNS, edge, load-balancing, and WAF roots, Qiniu's assigned test-delivery root, and the reviewed Cloudflare China network, insights, and storage-gateway roots use domestic cloud. Qiniu Kodo's documented Southeast Asia and North America S3 endpoint forms precede the domestic `qiniucs.com` fallback. Ordinary overseas infrastructure endpoints that would use the same default proxy selector through FINAL are not added only to improve classification completeness; region-sensitive AI, streaming, and similar services remain explicitly classified because their selected proxy geography affects behavior.

Generated-only `onedrive`, `icloud`, and `spotify-2` compatibility copies keep previously published Raw ruleset/provider URLs available with their original pre-merge matcher subsets and frozen list/provider hashes. They are derived deterministically from the consolidated `cloud-storage` or `spotify` source, included in the generated SHA-256 manifest, and are not canonical segments, rule-count inputs, or active Subconverter/Mihomo references.

No cloud CIDR, ASN, `GEOSITE`, regular expression, or broad consumer-company root is added. The 19 intentional later-rule captures created by the cloud ownership layer are frozen in `tests/fixtures/cloud-routing-ledger.json`; concrete business rules such as Tencent GME, Epic downloads, GitHub S3, Google AI, YouTube, OpenAI Azure, and Bilibili's Kingsoft hosts remain ahead of the cloud layer.

## Immutable reconstruction and compatibility evidence

The one-time reconstruction was cross-checked against original Subconverter presets, Mihomo providers, rule order, and `.list` files before `sources/` became canonical. The Phase 2 before/after fixtures and migration ledger preserve that state without treating current generated products as source evidence.

Phase 3 evidence remains layered and immutable:

- `phase-3-after.json` preserves the 1,615-rule historical Extended reduction before compatibility recovery;
- `phase-3-migration-ledger.json` proves that reduction against frozen Phase 2 state;
- `phase-3-recovery-ledger.json` derives 2,737 first-effective DIRECT-default candidates from frozen Phase 2 history at `8dbf3e6f7c2aedfa0fd9c485f63d76c1ace31faf`;
- its security filter excludes seven historical `DOMAIN-KEYWORD` candidates and adds anchored `roblox.com` and `rbxcdn.com`, yielding 2,732 historical recovery emissions;
- `public-rule-exclusions.json` then removes 11 high-confidence non-general recovery entries from current publication without rewriting the historical ledger.

Recovery is compatibility evidence, not renewed evidence that each recovered domain or IP remains current, official, or exclusively owned by its mapped vendor.

## Limits of historical evidence

The original expanded profile did not preserve:

- one original repository and revision for every matcher;
- upstream file boundaries inside contiguous target segments;
- the converter's exact node-filter expressions;
- proxy node names, addresses, ports, passwords, keys, or subscription URL;
- provider-specific DNS, TUN, Hosts, or other client settings;
- proof that one aggregate upstream, rather than a common ancestor or independently compiled factual list, supplied every overlapping indicator.

For this reason, the reconstruction record does not claim one complete external source for the current corpus. Current direct imports are identified explicitly with pinned revisions, licenses, selection policies, and output hashes.

## License and attribution boundary

The repository as a whole is released under the [MIT License](../LICENSE). [`NOTICE.md`](../NOTICE.md) records current direct inputs, trademarks, and disclaimers. Company and product names remain trademarks or identifiers of their respective owners.
