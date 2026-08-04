# Rule Changes

ER-001 through ER-010 use the audit date **2026-07-30**; ER-011 and ER-012 use **2026-07-31**; ER-013 uses **2026-08-01**; ER-014 and ER-015 use **2026-08-02**; ER-016 through ER-021 use **2026-08-03**; ER-022 and ER-023 use **2026-08-04**.
Canonical rule edits are made only under `sources/rules/`; generated products are rebuilt and
independently validated after each batch.

## ER-001 — Canonical-source migration

**Type:** infrastructure, zero-behavior migration

- Added an ordered 43-segment manifest, 42 ordered proxy groups, a sanitized base, and 42
  canonical rule files.
- Preserved the two non-contiguous music segments as `music` and `music-2`.
- Removed the credential-bearing expanded profile from the normal generation and validation path.
- Added deterministic clean staging, directory replacement, `--check`, and SHA-256 product
  manifest generation.
- Fixed `analysis.json` so `music` and `music-2` report per-segment rule types instead of a merged
  target-level count.

## ER-002 — Same-segment exact deduplication

**Type:** mechanical, no first-match behavior change

Removed 143 later occurrences of text-identical rules within the same physical segment. The first
occurrence and segment order were retained. No cross-segment deduplication was performed.

| Segment | Removed |
|---|---:|
| `global-web` | 86 |
| `emby` | 43 |
| `hbo-go` | 7 |
| `media-taiwan` | 3 |
| `hbo-max` | 2 |
| `game-download` | 1 |
| `media-japan` | 1 |

## ER-003 — Invalid CIDRs and generated sentinels

**Type:** deterministic error removal

Deleted rather than guessed corrected prefixes:

- `emby`: `IP-CIDR,161.97.148.156/24,no-resolve`
- `global-web`: `IP-CIDR,108.168.174.0/16,no-resolve`
- `global-web`: `IP-CIDR,174.37.243.0/16,no-resolve`
- `global-web`: `IP-CIDR,75.126.150.0/16,no-resolve`
- `global-web`: `IP-CIDR,69.171.235.0/16,no-resolve`

The addresses have host bits set for their declared prefix. The four `global-web` entries came
from a historical WhatsApp/SoftLayer block; changing them to a guessed network would broaden
shared-cloud routing without evidence.

Also deleted `DOMAIN-SUFFIX,gfwlist.start` and `DOMAIN-SUFFIX,gfwlist.end`. ACL4SSR used these as
historical generated-section sentinels; they are not service domains.

Evidence:

- <https://github.com/ACL4SSR/ACL4SSR/blob/cc5226ec097907cb6d679bc95cebf798aea008f2/Clash/ProxyGFWlist.list>
- <https://github.com/ACL4SSR/ACL4SSR/commit/9810a20772c143c04b0647521c9cce5dea3ac2f6>
- <https://github.com/ACL4SSR/ACL4SSR/commit/4b560dd2574b57d58f3467a43ec99974865ff002>

## ER-004 — High-confidence defunct or misclassified domains

**Type:** deterministic stale-rule removal

| Segment | Removed rule | Reason and evidence |
|---|---|---|
| `music-2` | `DOMAIN-SUFFIX,spotilocal.com` | Spotify's historical local WebHelper API was removed around 2017; current maintained source comparisons no longer support it. |
| `music-2` | `DOMAIN,spotify.map.fastly.net` | The exact naked mapping name is not the active Spotify hostname; live traffic uses child names such as `atc.spotify.map.fastly.net`, which an exact `DOMAIN` rule never matched. |
| `music-2` | `DOMAIN,spotify.map.fastlylb.net` | Defunct exact hostname; no current Spotify/Fastly operating evidence was found. |
| `music-2` | `DOMAIN-SUFFIX,static-qobuz.com` | Defunct static domain; current Qobuz assets use other hosts. |
| `global-web` | `DOMAIN-SUFFIX,azubu.tv` | Azubu and Hitbox were merged and relaunched as Smashcast in 2017. |
| `global-web` | `DOMAIN-SUFFIX,spring.net` | Current domain is an unrelated Web3 platform; Java Spring uses `spring.io`. |
| `global-web` | `DOMAIN-SUFFIX,ocnttv.com` | Historical TV domain has been repurposed for unrelated content. |

Related evidence:

- <https://www.fastly.com/documentation/guides/concepts/routing-traffic-to-fastly/>
- <https://github.com/v2fly/domain-list-community/commit/c2fbbc92a3bc36c8be0e3dc0bae29c49e0a83aec>
- <https://www.prweb.com/releases/hitbox_and_azubu_to_relaunch_as_smashcast_emerging_as_the_world_s_largest_independent_esports_broadcaster_outside_asia/prweb14322326.htm>
- <https://spring.io/projects/spring-framework/>

The uncertain `pscdn.co`, community services, and transient DNS/HTTP failures remain review items;
they were not removed by this change.

## ER-005 — Redundant Spotify keywords

**Type:** precision correction

Removed from `music-2`:

- `DOMAIN-KEYWORD,-spotify-`
- `DOMAIN-KEYWORD,spotify.com`

The exact Spotify suffixes remain. The keywords were redundant for valid Spotify domains and also
matched unrelated names such as `foo-spotify-bar.example` or `spotify.com.attacker.example`.

## ER-006 — Historical Google QA/Qualys hosts

**Type:** high-confidence stale-rule removal

Removed all 24 combinations of these host prefixes and zones from `google`:

- prefixes: `distribution`, `download`, `monitoring`, `qagpublic`, `qgadmin`, `qualysapi`,
  `qualysguard`, `scanservice1`
- zones: `qatp1.net`, `qcpp1.net`, `qpdp1.net`

The audit found consistent NXDOMAIN results, no usable HTTP/TLS endpoint, and upstream deletion in
2025–2026. These historical enterprise QA/Qualys names were not current Google service domains.

Evidence:

- <https://github.com/v2fly/domain-list-community/commit/23e6b743e1fa9277aa346ebb6eae9d6aebd24f23>
- <https://github.com/v2fly/domain-list-community/commit/8dc538dce9bcdd5650c2dcbce077c44ac44f5a28>

## ER-007 — Stale fixed cloud IPs

**Type:** precision and tenant-reuse correction

Removed all local occurrences of:

- `104.154.127.126/32`
- `35.186.224.47/32`
- `52.211.1.180/32`
- `99.81.97.56/32`

The first two were historical Spotify bindings in shared Google Cloud space and had drifted;
`35.186.224.47` showed a different tenant identity. The latter two were old/shared AWS addresses
without a current exclusive Qobuz relationship. Fixed shared-cloud IPs are not stable service
identifiers.

Evidence:

- <https://rdap.arin.net/registry/ip/104.154.127.126>
- <https://rdap.arin.net/registry/ip/35.186.224.47>
- <https://ipinfo.io/52.211.1.180>
- <https://ipinfo.io/99.81.97.56>

## ER-008 — Overbroad regional and keyword routing

**Type:** first-match behavior correction

Removed from early specialized segments:

- Japan media: `DOMAIN-SUFFIX,jp`, `DOMAIN-KEYWORD,.jp`, `DOMAIN-KEYWORD,ntt`
- Korea media: `DOMAIN-SUFFIX,kr`, `DOMAIN-KEYWORD,.kr`
- Taiwan media: `DOMAIN-KEYWORD,friday`

Behavior changes:

| Input | Before | After |
|---|---|---|
| `example.jp` | `media-japan` via `.jp` | `global-web` via `jp` |
| `example.kr` | `media-korea` via `.kr` | `global-web` via `kr` |
| `blackfridaysale.example` | `media-taiwan` via keyword | FINAL |
| `unrelated-ntt.example` | `media-japan` via keyword | FINAL |
| `video.friday.tw` | `media-taiwan` | unchanged via exact service suffix |

## ER-009 — Shared infrastructure moved out of specialized policies

**Type:** first-match behavior correction

Removed shared roots from earlier specialized segments while keeping explicit service hosts:

- bare `hinet.net` from Taiwan media, Bahamut, and global media;
- bare `gvt1.com`/`gvt2.com` from Bahamut, YouTube, and global media;
- bare `sentry.io` from Claude and Dazn;
- `players.brightcove.net` and `edge.api.brightcove.com` from specialized media segments;
- shared AWS ranges `18.194.0.0/15`, `34.224.0.0/12`, `54.242.0.0/15` from Messaging;
- shared GCP range `35.192.0.0/12` from Game Platform.

Added general `global-web` suffixes for `sentry.io`, `players.brightcove.net`, and
`edge.api.brightcove.com`. Existing `global-web` rules already handled bare HiNet, GVT, and the
three AWS ranges. The GCP range was not rebound to another service and now falls through to FINAL.

Representative behavior:

| Input | Before | After |
|---|---|---|
| `mail.hinet.net` | Taiwan media | global web |
| `theater-kktv.cdn.hinet.net` | Taiwan media via bare HiNet | Taiwan media via exact KKTV host |
| `download.gvt1.com` | Bahamut/YouTube shared root | global web |
| `redirector.gvt1.com` | shared root | Google explicit subdomain |
| `app.sentry.io` | Claude | global web |
| `players.brightcove.net` | Japan/HBO shared host | global web |
| `18.194.1.1` | Messaging | global web |
| `34.224.1.1` | Messaging | global web |
| `54.242.1.1` | Messaging | global web |
| `35.192.1.1` | Game Platform | FINAL |

## ER-010 — Generation and importer safety hardening

**Type:** tooling safety, portability, and fail-closed validation

- Existing output directories are replaced only when a valid Ekko Rules manifest and all recorded
  SHA-256 hashes prove ownership; arbitrary directories are never overwritten.
- `--check` and validation now detect unexpected empty directories as well as files.
- Published URLs reject userinfo, fragments, sensitive query parameters, and paths that do not
  match the configured GitHub repository.
- Proxy-provider paths are fixed portable relative paths; Windows and POSIX absolute paths are
  rejected.
- `mixed-port` rejects booleans and values outside 1–65535.
- Full `analysis.json` content is independently recomputed and compared, including when the
  optional generation check is skipped.
- The legacy importer requires a final standalone MATCH, rejects partial-node groups that would
  broaden to all subscription nodes, writes through clean staging, and leaves no partial output on
  failure.
- `.gitattributes` forces LF for canonical and generated text on Windows and Linux.
- Regression coverage increased from 11 to 20 tests, including mutation and failure-path tests.

## ER-011 — Phase 2 scoped classification

**Type:** product split, service classification, and first-match precision correction

- Added explicit `core` and `optional` scope to every segment and policy group.
- Split Messaging into LINE, Kakao, WhatsApp, and Telegram without changing their shared policy.
- Split music into Tidal, Spotify, Qobuz, and Apple Music. Optional Spotify legacy and Qobuz
  brand-defense entries remain in their original relative positions in Extended.
- Added minimal AI, social, and developer policies, plus a `private` ruleset targeting `DIRECT`.
- Moved Emby community, personal/community, and historical-streaming preferences out of Core.
- Moved shared OpenAI/Claude dependencies to global routing and removed shared CDN roots from
  `global-media`; service-specific CDN hosts remain specialized.
- Removed 23 occurrences only when they were covered duplicates, overbroad keywords, shared
  misclassification, or residual copies of stale entries already approved in ER-004.
- Preserved Apple/Google aggregate rules pending separate complete line-by-line brand-defense and
  legacy migrations; Phase 2 does not claim that work is complete.
- Hardened the release gates after adversarial review: Core/Extended scope metrics are now frozen,
  YAML/JSON duplicate keys and symbolic links are rejected, known credential formats are scanned,
  every Subconverter control is checked even without regeneration, and Legacy importer output now
  completes the standard generate/validate chain.

Behavior examples:

| Input | Before | Core after | Extended after |
|---|---|---|---|
| `10.0.0.1` | China web | DIRECT private | DIRECT private |
| `cursor.com` | Global web | AI services | AI services |
| `github.com` | Global web keyword | Developer services | Developer services |
| `line.me` | Messaging | LINE slug / same policy | LINE slug / same policy |
| `pscdn.co` | Music | Global media fallback | Spotify legacy / Music |
| `pub1.emby.wtf` | EMBY | FINAL | Emby community / EMBY |
| `statsig.com` | OpenAI | Global web | Global web |
| `storage.googleapis.com` | Claude | Google | Google |
| `example.amazonaws.com` | Global media | Global web | Global web |
| `dcalivedazn.akamaized.net` | DAZN | DAZN | DAZN |

Migration closure is frozen in `tests/fixtures/phase-2-migration-ledger.json`:

```text
15,540 old file rules = 15,517 Extended + 23 explicit removals
15,517 Extended = 15,411 Core + 106 optional
```

## ER-012 — Phase 3 AI/entertainment specialization and rule reduction

**Type:** product specialization, policy-group consolidation, generic-rule removal, and large-ruleset rebuild

- Consolidated Core from 44 to 37 policy groups; Extended now contains 38 with EMBY as its only additional group.
- Kept OpenAI and Claude independent, replaced the old generic AI policy with `🌐 海外 AI`, and added separate Google AI, xAI, Microsoft AI, and AI developer-tool rulesets.
- Added `🇺🇸 美国流媒体` and a 38-domain high-confidence `🔞 NSFW` ruleset. ESPN domains have a single owner in US Media rather than being shadowed by the earlier DisneyPlus segment. NSFW contains no broad keyword, public suffix, shared cloud root, or destination-IP rule.
- Merged OneDrive/iCloud into Cloud Storage, Instagram into Social Media, Bing into Microsoft Services, ordinary HMT media into one group, and Bilibili SEA into Southeast Asian Media. Bilibili HMT remains independent. Bing's ordered entries are physically part of the adjacent Microsoft ruleset so Extended stays within Subconverter's 64-segment external-config limit without changing matcher order or target.
- Removed `global-web`, `academic`, `yahoo`, `community-overrides`, and `streaming-legacy` entirely. These rules were not moved into another generic bucket; unmatched traffic naturally reaches FINAL.
- Rebuilt Apple, Google, Microsoft, Netflix, global media, game platform, China media, YouTube, Bilibili HMT, iQIYI, and Japan/HMT media around service roots, dedicated infrastructure, processes, and clearly owned IP space.
- Reduced Netflix from 1,050 to 53 rules by removing shared AWS ranges while retaining Netflix domains, process matching, and narrow Netflix network ranges.
- Preserved `GEOIP,CN,no-resolve` and the parser-level requirement that every destination-IP matcher carries `no-resolve`.

Migration closure is frozen in `tests/fixtures/phase-3-migration-ledger.json`:

```text
15,517 Phase 2 Extended rules = 1,549 common + 13,968 removed
1,615 Phase 3 Extended rules = 1,549 common + 66 added
```

Removal is a product-scope decision and does not claim that every removed domain is defunct. The complete removed/added Counter digests are verified against the Phase 2 commit in CI.

## ER-013 — DIRECT-default late recovery

**Type:** default-routing compatibility correction without proxy-rule restoration

Phase 3 correctly removed the five generic proxy/manual-first rulesets, but its large specialized-table rebuild also made historical DIRECT-default matchers fall through to proxy FINAL. ER-013 does not restore the generic proxy corpus. Instead, six Core recovery rulesets are placed after `china-web` (including `GEOIP,CN,no-resolve`) and immediately before FINAL, targeting the existing DIRECT-first Apple, Microsoft, Game Platform, China Media, Bilibili HMT, and iQIYI groups.

The immutable `phase-3-after.json` preserves the 1,615-rule post-reduction state, while `phase-3-recovery-ledger.json` proves:

```text
3,472 historical DIRECT-default occurrences = 638 Phase-3-covered + 2,834 residual
2,834 residual = 2,737 first-effective candidates + 97 historical-shadow/proxy-owner exclusions
2,732 emitted recovery = 2,737 candidates - 7 unsafe DOMAIN-KEYWORD entries + 2 anchored Roblox suffixes
```

All late recovery rulesets reject `DOMAIN-KEYWORD`: the historical Epic Games, Steam, Roblox, iQIYI, and Bilibili substring matchers could route unrelated lookalike domains to DIRECT-default policies. Six were already represented by earlier precise service rules; Roblox is replaced by `roblox.com` and `rbxcdn.com`, based on Roblox's official education-network allowlist. Lookalike names now continue to FINAL.

The recovery set contains 101 destination-IP rules, all with `no-resolve`. It completely covers zero of the 8,765 first-effective proxy/manual-first residual matchers. Current detailed rules and CN GeoIP remain earlier, so recovery only changes traffic that would otherwise reach FINAL. Historical ownership and current vendor validity are not reasserted; the layer preserves the prior default network action and remains subject to publication provenance review.

## Historical ER-013 verified result

Before the public single-product reduction, ER-013 produced:

- Core: 59 rule files, 60 ordered segments, 37 proxy groups, 4,250 rules including FINAL
- Extended: 63 rule files, 64 ordered segments, 38 proxy groups, 4,348 rules including FINAL
- 206 destination-IP rules in both products, all with `no-resolve`
- zero same-segment exact duplicates and zero non-strict CIDRs

These figures remain historical ledger context rather than current published-product metrics.

## ER-014 — Public single-product reduction and routing hardening

**Type:** product-surface reduction, license finalization, and DIRECT-default safety correction

The live product was reduced to one standard configuration backed by 59 shared rulesets at ER-014:

- Subconverter: `config/ekko-rules.ini`
- Mihomo: `Mihomo/reversed-template.yaml`

Full, local, Extended, EMBY community, Spotify legacy, Qobuz brand-defense, and generated base-config artifacts are retired. No automatic-latency group or Mihomo proxy-provider health probe remains. The repository is licensed under MIT; factual overlap, trademark, and disclaimer language remains in `NOTICE.md` and `docs/PROVENANCE.md`.

A load-time security gate now rejects `DOMAIN-KEYWORD` under every DIRECT-default policy, not only late recovery. The broad Microsoft and aria2 keywords were removed; Apple CDN entries use anchored suffixes and TestFlight is covered by the existing `apple.com` suffix.

Current verified canonical result:

- 59 rule files, 60 ordered segments, 37 proxy groups
- 4,247 rules including the unique FINAL
- 206 destination-IP rules, all with `no-resolve`
- zero same-segment exact duplicates and zero non-strict CIDRs
- first-match unreachable union: 53; same-segment: 13; cross-segment-only: 40

## ER-015 — Explicit China GEOIP DIRECT routing

**Type:** routing-target clarification and user-facing DNS trade-off documentation

The terminal China GEOIP matcher was split from `china-web` into its own canonical ruleset targeting `DIRECT`. The classical ruleset still stores `GEOIP,CN,no-resolve`, while generated products now bind it explicitly:

- Subconverter expands it as `GEOIP,CN,DIRECT,no-resolve`;
- Mihomo emits `RULE-SET,china-geoip-direct,DIRECT`.

The new segment remains after detailed China website rules and before all six late-recovery segments. Rule count, destination-IP count, policy-group count, and first-match coverage remain unchanged; only the physical ruleset/segment count increases.

Current verified canonical result:

- 60 rule files, 61 ordered segments, 37 proxy groups
- 4,247 rules including the unique FINAL
- 206 destination-IP rules, all with `no-resolve`
- zero same-segment exact duplicates and zero non-strict CIDRs
- first-match unreachable union: 53; same-segment: 13; cross-segment-only: 40

`no-resolve` remains the default because it prevents GEOIP matching from initiating an extra DNS lookup.

## ER-016 — Classic mainland-domain recovery and policy-group cleanup

**Type:** domestic-routing compatibility, anchored-domain import, and policy-group presentation

The standard product adds one classic mainland-domain ruleset after all six late-recovery segments and immediately before the terminal China GEOIP and FINAL. The fixed tail is now:

```text
all specialized rules
→ six late-recovery rulesets
→ china-domains-direct
→ GEOIP,CN,DIRECT,no-resolve
→ MATCH,🐟 漏网之鱼
```

`china-domains-direct` is a pinned, deterministic import from `v2fly/domain-list-community` revision `660198a50bac2ab10c567d95a472a7b33915d1b0` under MIT. It emits 1,482 anchored rules—1,481 `DOMAIN-SUFFIX` and one `DOMAIN`—from 31 named mainland service categories. Includes, `!cn` entries, keywords, regular expressions, single-label suffixes, and rules covered by earlier canonical segments are excluded. Normal generation remains offline; the import evidence is frozen in `tests/fixtures/china-domain-import-ledger.json`. ACL4SSR's CC-BY-SA ChinaDomain corpus was evaluated but not imported.

Every destination-IP matcher still carries `no-resolve`. The classic domain layer restores common mainland-domain classification without relying on implicit DNS resolution, while terminal GEOIP can still evaluate an IP already known by the client.

Policy-group presentation was also normalized:

- `🧲 OpenAI`, `🧲 Claude`, and `🧲 海外 AI` are consecutive at the top, followed by `🔎 Google`;
- US long-tail streaming now uses `🎬 美国流媒体`;
- HBO GO and Max share `🎬 HBO GO/MAX`, while their two rulesets remain separate and DAZN remains independent.

Current verified canonical target:

- 61 rule files, 62 ordered segments, 36 proxy groups;
- 5,729 rules including the unique FINAL;
- 206 destination-IP rules, all with `no-resolve`;
- zero same-segment exact duplicates and zero non-strict CIDRs;
- first-match unreachable union: 53; same-segment: 13; cross-segment-only: 40.

## ER-017 — Node.js/npm and NSFW service coverage

**Type:** anchored service-domain expansion

The `🧑‍💻 开发服务` ruleset adds six official Node.js and npm roots:

- `nodejs.org`, covering the website, documentation, and release downloads;
- `nodejs.dev` and `iojs.org`, the official redirect domains documented by Node.js;
- `npmjs.com`, `npmjs.org`, and `npm.im`, covering the npm website, public registry, package tarballs, and official short domain.

The `🔞 NSFW` ruleset adds nine user-confirmed service domains: `missav.ws`, `missav.ai`, `missav.live`, `hanime1.me`, `hanimeone.me`, `hanime1.com`, `javchu.com`, `av.jkforum.net`, and `javdb.com`. Existing `e-hentai.org` coverage remains unchanged. `av.jkforum.net` is intentionally anchored at the service subdomain rather than classifying the whole `jkforum.net` forum.

All additions use `DOMAIN-SUFFIX`; no broad `DOMAIN-KEYWORD`, public suffix, shared infrastructure root, or destination-IP matcher is introduced. The `🔞 NSFW` select group now lists Mihomo/Clash's built-in `REJECT` action first, making rejection the default while preserving manual access to the standard selector, `DIRECT`, and subscription nodes.

Current verified canonical target:

- 61 rule files, 62 ordered segments, 36 proxy groups;
- 5,744 rules including the unique FINAL;
- 206 destination-IP rules, all with `no-resolve`;
- zero same-segment exact duplicates and zero non-strict CIDRs;
- first-match unreachable union: 53; same-segment: 13; cross-segment-only: 40.

## ER-018 — Community contribution workflow and converter guidance

**Type:** repository community health, support boundaries, and documentation

The repository now provides three structured GitHub Issue Forms for domain/service additions, policy-group or mapping changes, and routing misclassification. Blank issues are disabled. `CONTRIBUTING.md`, `SUPPORT.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, and a pull-request template define evidence, privacy, first-match, provenance, and validation expectations. The README links directly to each form and includes a safe prompt for asking a coding agent to prepare an issue without reading or submitting subscription credentials, node data, or complete client configurations.

Subconverter guidance now recommends `https://sub.v1.mk/` for subscriptions that use newer protocols such as AnyTLS. `https://acl4ssr-sub.github.io/` remains documented as a popular alternative with older protocol support that may not convert newer protocols. Both paths retain the full-URL candidate selection and final `config=https%3A...` versus `config=%20https%3A...` checks.

The user-facing project-boundary section now describes only Ekko Rules itself. Public attribution focuses on sources that directly contribute to the current canonical product; early reconstruction comparisons remain internal audit evidence.

## ER-019 — Advertising block policy and public-rule provenance cleanup

**Type:** new blocking capability, public-product cleanup, and provenance restructuring

A new `🛑 广告拦截` group defaults to `REJECT` and remains manually switchable. Its ruleset sits after private/local routing and before all specialized services. A pinned, one-time MIT import from `v2fly/domain-list-community` `category-ads` resolves upstream include and `@ads` filtering semantics, then emits 849 anchored rules: 677 `DOMAIN-SUFFIX` and 172 `DOMAIN`. The sole regexp is excluded; `category-ads-all` is not imported because its provider, analytics, and messaging scope has a broader false-positive boundary.

Advertising intentionally captures 40 later telemetry/advertising rules that were previously owned by service segments. The exact cross-segment set is frozen in `advertising-routing-ledger.json`; any additional capture requires review.

The one-entry `direct-override` ruleset and `DOMAIN,huaikhwang.central-world.org` were removed because they belonged to a provider-specific website rather than a general public product. Eleven additional high-confidence local institution, personal site, third-party script, mirror, or unofficial-content entries were removed from Apple and Game Platform recovery. Immutable historical fixtures and the original recovery ledger remain unchanged; `public-rule-exclusions.json` records the current publication filter.

`NOTICE.md` and `docs/PROVENANCE.md` were restructured to distinguish:

- independently maintained current rules, group design, defaults, and removals;
- explicit pinned MIT canonical imports for mainland domains and advertising;
- historical recovery evidence retained for compatibility verification;
- early comparison records kept only as internal audit evidence rather than current-product attribution.

Current verified canonical target:

- 61 rule files, 62 ordered segments, 37 proxy groups;
- 6,581 rules including the unique FINAL;
- 206 destination-IP rules, all with `no-resolve`;
- zero same-segment exact duplicates and zero non-strict CIDRs;
- first-match unreachable union: 93; same-segment: 13; cross-segment-only: 80, including the frozen 40-rule advertising capture set.

## ER-020 — Developer experience, remote streaming, and mainland/global AI split

**Type:** policy specialization, anchored service expansion, and first-match correction

The `🧑‍💻 开发服务` group continues to list `♻️ 手动切换` first, followed by `DIRECT` and subscription nodes. Its anchored corpus now covers mainstream developer control planes, registries, and downloads across GitHub/GitLab, Docker/GHCR, Maven/Gradle, Node.js/npm, Python/PyPI, Rust/Cargo, Go, NuGet, RubyGems, Composer, Homebrew, CocoaPods, Yarn, and pnpm. This prioritizes official-source availability and speed while preserving an immediate manual `DIRECT` override. Generic cloud, object-storage, CDN, and public relay roots are still excluded; established mainland mirrors continue to use mainland DIRECT routing.

A new `🖥️ 远程串流` group defaults to `DIRECT` and sits immediately after private routing. Its 53-rule corpus covers verified process or anchored control/signal/relay paths for Tailscale, ZeroTier, Moonlight, Sunshine, Parsec, RustDesk, AnyDesk, TeamViewer, NetBird, Chrome Remote Desktop, Steam Link, and Microsoft RDP. The user-required `ts.net` suffix deliberately covers tailnet user namespaces, while the TeamViewer suffix deliberately covers dynamic master/router relay hosts. Generic CGNAT ranges, public STUN/TURN namespaces, browser-wide or Steam-wide processes, user-defined server domains, and shared cloud/CDN roots remain excluded.

The user-requested `author-domain` segment places `DOMAIN-SUFFIX,zaunekko.com` first globally and maps it to `🌏 国内网站` as an explicit authorship-display exception. DeepSeek, Xiaohongshu, and verified Chinese AI mainland roots are merged into the ordinary `china-web` segment so they remain after advertising; no separate mainland-fix segment is published. Distinct international domains—including `kimi.com`, `z.ai`, `qwen.ai`, `qwenlm.ai`, `minimax.io`, ByteDance global AI roots, `figma.com`, and `figma.site`—enter `🧲 海外 AI`. Existing Baidu Wenxin, Tencent Yuanbao/Hunyuan, iFlytek Spark, Taobao, and mainland mirrors remain owned by the classic mainland-domain layer. Kimi legacy mainland URLs now redirect to `kimi.com`; because routing is hostname-based, the shared final hostname follows the international policy.

Current verified canonical target:

- 63 rule files, 64 ordered segments, 38 proxy groups;
- 6,693 rules including the unique FINAL;
- 206 destination-IP rules, all with `no-resolve`;
- zero same-segment exact duplicates and zero non-strict CIDRs;
- first-match unreachable union: 94; same-segment: 13; cross-segment-only: 81.

## ER-021 — Steam mainland downloads and consumer-service routing gaps

**Type:** exact-host recovery, mainland service compatibility, and first-match boundary hardening

Two exact mainland Steam content hosts now enter `🎮 游戏下载`: `gstore.val.manlaxy.com`, corroborated by Steam content evidence, and `xz.sycontroller.com`, confirmed during a live Steam download after a temporary manual rule repeatedly matched it. Both remain exact `DOMAIN` entries. Shared `manlaxy.com`, `sycontroller.com`, and `gdtstream.com` suffixes are excluded; `yif.gdtstream.com` remains unaccepted; the unresolving likely typo `dl.steam.cygnaa.com` is not added because the existing `dl.steam.clngaa.com` rule is preserved; and the observed ZeroTier address and surrounding ranges are not converted into Steam IP rules.

`china-web` adds anchored `ele.me`, `eleme.cn`, `elemecdn.com`, `alibaba.cn`, and `alibaba.com.cn` suffixes for observed mainland service gaps. Advertising remains earlier and continues to capture `adashx.ut.ele.me`, `h-adashx.ut.ele.me`, and `v6-adashx.ut.ele.me`. Existing Taobao, mainland Tmall, 1688, JD, Meituan, and Dianping coverage remains in the pinned classic mainland-domain layer instead of being duplicated. International storefronts and shared `alicdn.com` infrastructure remain outside this patch.

Current verified canonical target:

- 63 rule files, 64 ordered segments, 38 proxy groups;
- 6,700 rules including the unique FINAL;
- 206 destination-IP rules, all with `no-resolve`;
- zero same-segment exact duplicates and zero non-strict CIDRs;
- first-match unreachable union: 94; same-segment: 13; cross-segment-only: 81.

## ER-023 — Domestic and overseas cloud routing split

**Type:** cloud-infrastructure policy separation, regional endpoint precedence, and segment-budget consolidation

Two independent, manually switchable groups now own cloud infrastructure:

- `☁️ 国内云服务` defaults to `DIRECT` for Alibaba Cloud, Tencent Cloud, Huawei Cloud, Volcengine, UCloud, QingCloud, Baidu AI Cloud, JD Cloud, Kingsoft Cloud, Qiniu, China Telecom Cloud, AWS China, Azure China, and Cloudflare China;
- `☁️ 海外云服务` defaults to `♻️ 手动切换` for global AWS, Azure, Google Cloud, Cloudflare, DigitalOcean, Vultr, Linode/Akamai, and Oracle Cloud, together with international Alibaba Cloud, Tencent COS, and Huawei Cloud endpoints.

First-match order is intentional: advertising and concrete AI, development, game, media, cloud-storage, Apple, and late-recovery service endpoints remain earlier; international Alibaba OSS, Tencent COS, Huawei, UCloud US3, Kingsoft KS3, and China Telecom OOS regional suffixes then precede their mainland vendor parent roots; cloud infrastructure next precedes Microsoft, Google, and the classic mainland aggregate. Tencent GME, Epic downloads, GitHub S3, Google AI, YouTube, OpenAI Azure, and Bilibili Kingsoft hosts therefore retain their concrete owners. The 71 reviewed later-rule captures owned by the cloud layer are frozen in `tests/fixtures/cloud-routing-ledger.json`.

No cloud CIDR, ASN, `GEOSITE`, regular expression, generic consumer-company root, or broad Akamai tenant suffix is added. All 206 destination-IP rules retain `no-resolve`; shared AWS/GCP addresses still fall through the domain-only model to FINAL.

The public product remains within the Subconverter 64-segment external-config ceiling. The two Spotify source segments are physically concatenated under the unchanged Music policy, and OneDrive plus iCloud are physically concatenated as `cloud-storage` under the unchanged Cloud Storage policy. Matcher order and targets are preserved; HBO GO and Max remain separate rulesets. Generated-only `onedrive`, `icloud`, and `spotify-2` compatibility copies preserve retired Raw ruleset/provider URLs and their original pre-merge matcher subsets through frozen list/provider hashes; no active Subconverter or Mihomo entry references those aliases, and they do not count as canonical segments or rules.

The exact OCI Console host `cloud.oracle.com` is included alongside the anchored `oraclecloud.com` infrastructure suffix. The broader consumer-company root `oracle.com` remains excluded. AWS's main portal and documentation under `aws.amazon.com`, canonical and regional `*.console.aws.amazon.com` hosts, sign-in flow, and `api.aws` service endpoints use overseas cloud. Azure's current public infrastructure-domain inventory—including API Management, Container Registry, IoT, containers, data and analytics, Kubernetes, machine learning, Storage, SQL, Service Bus, Redis, Search, SignalR, and Static Web Apps—uses documented roots while retired services and Microsoft business-product domains remain excluded; Vultr Object Storage uses `vultrobjects.com`. Shared `googleapis.com` stays under `🔎 Google`; official Google Cloud global API service endpoints and the Cloud Storage for Firebase API enter overseas cloud only through audited exact rules, alongside virtual-hosted Cloud Storage and official `rep.googleapis.com` regional endpoints. The duplicate mainland `recaptcha.net` matcher is removed so reCAPTCHA continues to use `🔎 Google` despite the cloud-order adjustment. Huawei's international console is separated from its domestic root, while Baidu AI Cloud's primary portal and console use domestic cloud. Reviewed non-mainland Alibaba region suffixes cover both `SERVICE.REGION.aliyuncs.com` and `SERVICE-vpc.REGION.aliyuncs.com` APIs before the domestic `aliyuncs.com` catch-all; Alibaba OSS's explicit overseas acceleration suffix remains ahead as well. The same regional-precedence pattern separates overseas UCloud US3, Kingsoft KS3, and China Telecom OOS endpoints before their domestic storage roots. JD Cloud DNS/edge/load-balancing/WAF, Qiniu `clouddn.com` test delivery, and reviewed Cloudflare China infrastructure roots now obey the domestic cloud selector.

Current verified canonical target:

- 63 rule files, 64 ordered segments, 40 proxy groups;
- 7,463 rules including the unique FINAL;
- 206 destination-IP rules, all with `no-resolve`;
- zero same-segment exact duplicates and zero non-strict CIDRs;
- first-match unreachable union: 146; same-segment: 13; cross-segment-only: 133, with 71 cloud captures independently frozen in the cloud routing ledger.

## ER-022 — Mainland high-frequency apps, game launchers, and in-game voice

**Type:** anchored mainland application expansion, existing-group reuse, and international first-match correction

The existing 38 policy groups remain unchanged. `china-web` gains reviewed official roots for Amap, Railway 12306, DingTalk, Feishu, WPS/KDocs, Aliyun Drive, major logistics, recruitment, housing, UnionPay and representative mainland banks, education, healthcare, and automotive services. These services enter the existing default-DIRECT `🌏 国内网站` group rather than creating category-specific groups or relying on terminal GEOIP.

`game-platform` gains mainland Xiaoheihe, 5EPlay, Perfect World esports, TapTap, MiHoYo, major gaming communities, WeGame, mainland League of Legends and Valorant, plus Tencent GVoice/GME service roots and documented exact configuration, RTC, and speech hosts used for in-game voice. Shared `qcloud.com`, `myqcloud.com`, general cloud/CDN roots, dynamic voice IPs, and a process-wide WeGame rule remain excluded. The more specific historical `csgo.wmsj.cn` and `dota2.wmsj.cn` late-recovery entries remain authoritative instead of adding a broad duplicate parent that would increase cross-segment unreachability.

`china-media` gains Douyin mainland, Huya, and YY and now precedes TikTok so the official Douyin-only `aweme.snssdk.com` host can be routed directly. The shared `snssdk.com` suffix remains in TikTok, preserving the user's selector for unclassified international traffic; explicitly international TikTok roots remain in that group. Advertising still precedes all three mainland segments and continues to capture reviewed Amap, MiHoYo, and Zuoyebang telemetry. TapTap international and shared cloud/storefront roots remain outside mainland routing.

Current verified canonical target:

- 63 rule files, 64 ordered segments, 38 proxy groups;
- 6,968 rules including the unique FINAL;
- 206 destination-IP rules, all with `no-resolve`;
- zero same-segment exact duplicates and zero non-strict CIDRs;
- first-match unreachable union: 94; same-segment: 13; cross-segment-only: 81.
