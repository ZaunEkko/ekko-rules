# Rule Changes

ER-001 through ER-010 use the audit date **2026-07-30**; ER-011 and ER-012 use **2026-07-31**; ER-013 uses **2026-08-01**; ER-014 and ER-015 use **2026-08-02**; ER-016 through ER-021 use **2026-08-03**; ER-022 and ER-023 use **2026-08-04**; ER-026 and ER-027 use **2026-08-10**; ER-028 and ER-029 use **2026-08-12**; ER-030 uses **2026-09-12**; ER-031 uses **2026-09-17**; ER-032 through ER-059 use **2026-09-19**.
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

The exact OCI Console host `cloud.oracle.com` is included alongside the anchored `oraclecloud.com` infrastructure suffix. The broader consumer-company root `oracle.com` remains excluded. AWS's main portal and documentation under `aws.amazon.com`, canonical and regional `*.console.aws.amazon.com` hosts, sign-in flow, `api.aws` service endpoints, and Lambda Function URLs under `on.aws` use overseas cloud. BytePlus's exact console and API root cover Volcengine's international cloud without adding a broad consumer-brand suffix. Azure's current public infrastructure-domain inventory—including API Management, Container Registry, IoT, containers, data and analytics, Kubernetes, machine learning, Storage, SQL, Service Bus, Redis, Search, SignalR, and Static Web Apps—uses documented roots while retired services and Microsoft business-product domains remain excluded; Vultr Object Storage uses `vultrobjects.com`. Shared `googleapis.com` stays under `🔎 Google`; official Google Cloud global API service endpoints plus Firebase Storage and Realtime Database management APIs enter overseas cloud only through audited exact rules; documented Firebase data endpoints, virtual-hosted Cloud Storage and official `rep.googleapis.com` regional endpoints. The duplicate mainland `recaptcha.net` matcher is removed so reCAPTCHA continues to use `🔎 Google` despite the cloud-order adjustment. Huawei's international console is separated from its domestic root, while Baidu AI Cloud's primary portal and console use domestic cloud. Reviewed non-mainland Alibaba region suffixes cover both `SERVICE.REGION.aliyuncs.com` and `SERVICE-vpc.REGION.aliyuncs.com` APIs before the domestic `aliyuncs.com` catch-all; Alibaba OSS's explicit overseas acceleration suffix remains ahead as well. The same regional-precedence pattern separates overseas UCloud US3, Kingsoft KS3, and China Telecom OOS endpoints before their domestic storage roots. JD Cloud DNS/edge/load-balancing/WAF, Qiniu `clouddn.com` test delivery, and reviewed Cloudflare China infrastructure roots now obey the domestic cloud selector. Qiniu Kodo's two documented overseas S3 regions use exact hyphenated and dotted endpoint suffixes before the domestic `qiniucs.com` fallback, so mainland buckets become `DIRECT` without pulling Southeast Asia or North America into the domestic policy. Ordinary overseas infrastructure endpoints that would use the same default proxy selector through FINAL are not added merely for classification completeness; region-sensitive AI and media services remain explicit exceptions.

Current verified canonical target:

- 63 rule files, 64 ordered segments, 40 proxy groups;
- 7,473 rules including the unique FINAL;
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

## ER-024 — Mainland game DIRECT boundary and download recovery

**Type:** policy-boundary correction, download classification, and voice-path protection

The existing `🌏 国内网站` group now owns mainland Chinese game launchers, login services, communities, storefronts, and Tencent GVoice/GME configuration, RTC, and speech endpoints. It remains default-DIRECT. Mainland game domains were also removed from the later game-platform recovery layer, preventing that late matcher from sending domestic voice or login traffic through a selected overseas node.

`🎮 游戏平台` is now reserved for overseas platforms and lists `♻️ 手动切换` before `DIRECT`. `🎮 游戏下载` remains DIRECT-first. The observed `down.val.qq.com` host enters game downloads through an exact rule before the broader `val.qq.com` mainland rule. WeGame, 4399, TapTap, Perfect World, current Battle.net China, GOG, Epic, EA, Ubisoft, Steam, PlayStation, Xbox, and Riot download endpoints are classified only through dedicated download hosts or download-specific suffixes; ordinary overseas platform roots remain under the manually selected platform group.

No additional policy group or ruleset segment is introduced. Tests freeze the three-way boundary: domestic game services to `🌏 国内网站`, dedicated downloads to `🎮 游戏下载`, and overseas platforms to `🎮 游戏平台`.

## ER-025 — Local and LAN stable subscription addresses

**Type:** self-hosted delivery, trusted-LAN access, and release hardening

The self-hosted Web service now follows conventional Compose behavior and publishes port `8787` on all host interfaces by default, so trusted-LAN devices can use the computer IP without rebuilding the stack. Windows gains a one-time `setup.cmd` path that starts Compose and registers a least-privilege current-user logon task; Docker Desktop can thereafter restore the `unless-stopped` containers while the independent helper keeps the host LAN address current without opening another port or reading subscription data. Session launchers remain available on Windows, macOS, and Linux. The compact address manager now sits beside saved profiles and switches exported prefixes among `localhost`, the current browser origin, the freshly detected or custom LAN address, and eight recently used origins. Once detected-LAN mode is selected, later host-IP changes update displayed, copied, and QR-rendered URLs automatically without changing profile IDs or reordering history. `WEB_BIND_HOST=127.0.0.1` remains available for explicit host-only deployments, `ACCESS_PASSWORD` is optional management protection, and `LAN_BASE_URL` can advertise a preferred origin. That advertised origin is a UI-only export hint: invalid values are ignored without degrading conversion, and every reachable origin can serve the same stable `/sub/<id>` path.

Every saved profile can be copied as a URL or rendered as an in-browser QR code for phones and tablets; QR data is never sent to an external service. Dependency installation now uses the lockfile through `npm ci`, the Next.js patch level and transitive security fixes are pinned, and release audit reports no known npm vulnerabilities. Browser User-Agents fall back to target-client defaults during profile creation while real subscription-client User-Agents continue to pass through during refreshes.

## ER-026 — Mainstream developer workflow coverage

**Type:** anchored service expansion, no policy-group or precedence change

The existing `🧑‍💻 开发服务` selector gains 142 anchored rules for mainstream developer collaboration, project management, API tooling, deployment control planes, CI/CD, observability, language ecosystems, infrastructure tooling, managed developer databases, and online IDEs. Representative additions include Linear, Slack, Atlassian/Jira/Confluence/Trello, Postman, Sentry, Vercel, Supabase, Netlify, Railway, Render, Fly.io, Heroku, CircleCI, Travis CI, Buildkite, Datadog, Grafana, New Relic, JetBrains, Deno, Bun, HashiCorp, Pulumi, Prisma, MongoDB, Redis, Neon, PlanetScale, Replit, CodeSandbox, StackBlitz, and CodePen.

The boundary remains intentionally narrow. Shared CDN and object-storage roots are excluded, as are public deployment suffixes such as `vercel.app`, `netlify.app`, `onrender.com`, and `herokuapp.com`. Sentry and New Relic use explicit console/API hosts instead of broad telemetry-ingestion suffixes, preventing ordinary application telemetry from being reclassified as developer traffic. Cloudflare uses exact dashboard, API, documentation, and root website hosts while the broader infrastructure namespace remains with `☁️ 海外云服务`. `vscode.dev` keeps its existing Microsoft ownership. The verified first-match unreachable metrics therefore remain unchanged at global union 146, same-segment union 13, and cross-segment-only union 133.

## ER-027 — Notion developer collaboration routing

**Type:** anchored service completion, no policy-group or precedence change

Notion's application, API, static assets, uploaded content, legacy `notion.so` entry points, and the official `notion.new` shortcut now route through `🧑‍💻 开发服务`. The five added rules cover `notion.com`, `notion.so`, `notion-static.com`, `notionusercontent.com`, and the exact `notion.new` host. Public user-published `notion.site` pages remain outside the developer selector, preserving the existing boundary that excludes user-hosted sites.

## ER-028 — Mainland AI video creation and third-party playback paths

**Type:** anchored service expansion and playback-path recovery

The default-DIRECT `🌏 国内网站` group gains company, product, API, and dedicated asset roots for Seko, Kling, Vidu, LiblibAI and LibTV, RunningHub, Tusi, MOKI, Chanjing, Wujie, Shanjian, Guiji, and Ocean Engine. Existing classic mainland coverage continues to own Jimeng and its Jianying path, Tencent Zhiying, Baidu AIGC, and WHEE, while the existing explicit rules continue to own Hailuo, Doubao, Qwen, and Zhipu. Brand-specific media roots are included, but shared Kuaishou, Vibex, TensorArt, public CDN, analytics, and object-storage roots remain outside this change.

The default-DIRECT `🌏 国内流媒体` group now covers both the collection API and the actual media path for current Liangzi, Feifan, Baofeng, Suoni, Baidou, Kuaiche, Shandian, Yinghua, Huya, Piaoling, Modu, Xinlang, Huohu, Subo, Hongniu, Zuida, and iKun integrations, with additional current API roots for Wujin. Media roots were sampled across each accessible provider's page range and filtered to the hosts serving returned `.m3u8`, share, image, or dedicated download URLs. Liangzi's separately hosted direct `.mp4` download paths are included because clients may download or stream those large files even though the sampled API classifies them under `vod_down_url`, not `vod_play_url`. Unrelated Douban, Geocities, and shared infrastructure hosts returned by metadata were deliberately excluded. This prevents high-volume playlist, playback, or download requests from falling through to `🐟 漏网之鱼` merely because the lightweight collection API matched DIRECT.

The change adds no policy group or ruleset segment and introduces no keyword, regular-expression, destination-IP, public-suffix, or shared-CDN matcher. Provider-owned playback domains can rotate, so the review record requires an evidence refresh instead of broadening the matching boundary.

Current verified canonical target:

- 63 rule files, 64 ordered segments, 40 proxy groups;
- 7,772 rules including the unique FINAL;
- 206 destination-IP rules, all with `no-resolve`;
- zero same-segment exact duplicates and zero non-strict CIDRs;
- first-match unreachable union: 146; same-segment: 13; cross-segment-only: 133.

## ER-029 — Mainland authentication, real-time, and foundation services

**Type:** restrained official-root expansion with existing-policy reuse

The default-DIRECT `🖥️ 远程串流` group gains official roots for ToDesk, Sunlogin/Oray, RayLink, Shengwang/Agora, ZEGO, RongCloud, and Easemob. Current Shengwang firewall guidance supplies the compact RTC transport roots; no dynamic IP, public STUN/TURN namespace, or guessed process name is added.

The default-DIRECT `🌏 国内网站` group gains one-root coverage for mainstream CAPTCHA and push providers, mainland code and model communities, collaboration tools, electronic certification, teaching platforms, and clearly mainland smart-device or connected-car entry points. Existing Tencent CAPTCHA, China Mobile number verification, and NetEase Yunxin coverage is reused from domestic cloud or the classic mainland import instead of being duplicated. Globally shared Tuya, Roborock, Ecovacs, and Dreame roots remain outside the automatic mainland boundary.

No policy group, ruleset segment, keyword matcher, destination-IP rule, or generic CDN suffix is introduced. The change adds 45 anchored suffix rules and keeps all existing first-match overlap metrics unchanged.

Current verified canonical target:

- 63 rule files, 64 ordered segments, 40 proxy groups;
- 7,817 rules including the unique FINAL;
- 206 destination-IP rules, all with `no-resolve`;
- zero same-segment exact duplicates and zero non-strict CIDRs;
- first-match unreachable union: 146; same-segment: 13; cross-segment-only: 133.

## ER-030 — Author domain: the conversion station

**Type:** single-root extension of an existing segment

`author-domain` already carried the author site under the default-DIRECT `🌏 国内网站` group. It gains the second root the project publishes from, `boxnook.cc`, which serves the open subscription conversion station at `sub.boxnook.cc`. Without it the station falls through to `🐟 漏网之鱼` and a subscriber cannot reach the tool that produced their own profile.

No policy group, ruleset segment, keyword matcher, destination-IP rule, or generic CDN suffix is introduced. The change adds one anchored suffix rule and keeps all existing first-match overlap metrics unchanged.

Current verified canonical target:

- 63 rule files, 64 ordered segments, 40 proxy groups;
- 7,818 rules including the unique FINAL;
- 206 destination-IP rules, all with `no-resolve`;
- zero same-segment exact duplicates and zero non-strict CIDRs;
- first-match unreachable union: 146; same-segment: 13; cross-segment-only: 133.
## ER-031 — Microsoft and Apple lead with the manual group

**Type:** default-policy change, no rule edits

`🧩 微软服务` and `🍎 苹果服务` are `select` groups that listed `DIRECT` first, so an untouched profile sent Microsoft and Apple traffic direct. Both now lead with `♻️ 手动切换`, matching `☁️ 海外云服务` and `🎮 游戏平台`. Members and order are otherwise unchanged, and `DIRECT` remains one selection away.

`microsoft-late-recovery` and `apple-late-recovery` do not follow. Those two rulesets were restored only to reproduce a historical DIRECT action and explicitly do not assert current vendor ownership; between them they carry 1,897 entries including generic Akamai infrastructure (`akadns.net`, `edgesuite.net`, `g.akamaiedge.net`) and strays such as `21vbc.com` and `100beatscheap.com`. Letting them follow the new default would have sent a large amount of unrelated traffic through the selected proxy. They now target `DIRECT` directly, which is what they were kept for, so the change reaches Microsoft and Apple themselves and nothing else.

The two routing ledgers record the new target for the rows those rulesets capture, and are re-sealed. The guard that forbids unanchored `DOMAIN-KEYWORD` matchers in DIRECT-default groups no longer covers the `microsoft` and `apple` rulesets, because their groups are no longer DIRECT-default; neither ruleset uses one, and the guard is still exercised against a default-DIRECT group.

No rule, ruleset segment, or proxy group is added or removed.

Current verified canonical target:

- 63 rule files, 64 ordered segments, 40 proxy groups;
- 7,818 rules including the unique FINAL;
- 206 destination-IP rules, all with `no-resolve`;
- zero same-segment exact duplicates and zero non-strict CIDRs;
- first-match unreachable union: 146; same-segment: 13; cross-segment-only: 133.

## ER-032 — HoYoverse international game routing

**Type:** single-service extension of two existing segments

The HoYoverse international surface had no anchored placement, so the global Honkai: Star Rail client fell through to `🐟 漏网之鱼` while the mainland roots `mihoyo.com`, `bhsr.com`, and `yuanshen.com` were already DIRECT under `🌏 国内网站`.

`game-platform` gains three anchored suffix rules — `hoyoverse.com` for account, SDK, and game API hosts; `hoyoplay.com` for the launcher; and `hoyolab.com` for the embedded community surface — plus six exact hosts that the broad mainland `mihoyo.com` root would otherwise capture into a DIRECT policy: `api-account-os`, `api-os-takumi`, `hk4e-api-os`, `hk4e-sdk-os`, `sdk-os-static`, and `webstatic-sea`. Three further `-os` candidates under `mihoyo.com` resolved NXDOMAIN at review time and are not added.

`starrails.com` goes to `game-download`, not `game-platform`. Every host under that root except `autopatchos.starrails.com` resolved NXDOMAIN at review time, so the root is a patch-delivery domain only. `game-download` precedes `game-platform` and its group leads with `DIRECT`, so multi-gigabyte client updates stay off the selected proxy.

The mainland roots are untouched and keep their earlier `china-web` placement. `advertising` still precedes both segments and its anchored `log-upload-os.hoyoverse.com` and `log-upload.mihoyo.com` telemetry rules continue to win first match; no later ruleset repeats either matcher, so the frozen advertising routing ledger and its capture count are unchanged.

No policy group, ruleset segment, keyword matcher, destination-IP rule, or generic CDN suffix is introduced.

Current verified canonical target:

- 63 rule files, 64 ordered segments, 40 proxy groups;
- 7,818 rules including the unique FINAL;
- 206 destination-IP rules, all with `no-resolve`;
- zero same-segment exact duplicates and zero non-strict CIDRs;
- first-match unreachable union: 146; same-segment: 13; cross-segment-only: 133.

## ER-033 — iQIYI group renamed to `🎬 爱奇艺国际`

**Type:** group rename, no rule edits

`🎬 爱奇艺` did not say why it exists separately from `🌏 国内流媒体`. Both default to `DIRECT` and behave identically until the user moves one, so the group read as redundant. Its actual purpose is that iQIYI publishes an international catalogue at `iq.com` that needs an overseas exit, while the rest of mainland streaming must stay direct; a shared group could not serve both. The group is renamed `🎬 爱奇艺国际` to state that.

Members and order are unchanged and the group still leads with `DIRECT`, because the ruleset also carries the mainland iQIYI roots and mainland playback must keep working untouched. The international catalogue depends on `iqiyi.com`, `qy.net`, and `iqiyipic.com` — `intl-rcd.iqiyi.com`, `intl-subscription.iqiyi.com`, `intl.iqiyi.com`, and `msg-intl.qy.net` were all observed live — so those roots are deliberately not split out to `china-media`; doing so would send the international session through two exits.

`tests/fixtures/phase-3-recovery-ledger.json` is sealed by SHA-256 and records the historical group name. It is not edited. The recovery test now maps the historical name to the current one so the ledger stays immutable. `scripts/reverse_profile.py` keeps the historical name in its importer vocabulary, which exists to recognise older and third-party profiles.

Current verified canonical target:

- 63 rule files, 64 ordered segments, 40 proxy groups;
- 7,818 rules including the unique FINAL;
- 206 destination-IP rules, all with `no-resolve`;
- zero same-segment exact duplicates and zero non-strict CIDRs;
- first-match unreachable union: 146; same-segment: 13; cross-segment-only: 133.

## ER-034 — Retired exact hosts removed

**Type:** stale-entry removal, no first-match behavior change

Ten exact `DOMAIN` matchers in repository-maintained rulesets no longer resolve. Each was confirmed NXDOMAIN against three independent resolvers — Google, AliDNS, and Cloudflare — before removal.

| Ruleset | Removed |
|---|---:|
| `game-download` | 7 |
| `bilibili-sea` | 1 |
| `hbo-go` | 1 |
| `kktv` | 1 |

The removed hosts are `gog-cdn-lumen.secure2.footprint.net`, `ssl-lvlt.cdn.ea.com`, `st-bak.viv.wanwang.space`, `steam.eca.qtlglb.com`, `steam.naeu.qtlglb.com`, `steam.ru.qtlglb.com`, `steampipe.steamcontent.tnkjmec.com`, `apm-misaka.biliapi.net`, `hbounify-prod.evergent.com`, and `kktv-theater.kk.stream`.

The four LAN administration hosts in `private` — `router.asus.com`, `www.asusrouter.com`, `instant.arubanetworks.com`, and `setmeup.arubanetworks.com` — also return NXDOMAIN publicly and are deliberately kept. They resolve only on the local network, which is exactly why they carry a DIRECT rule.

The pinned `advertising` import and the frozen late-recovery rulesets contain further non-resolving hosts. Neither is edited: both are sealed by immutable ledgers and their contents are evidence, not maintained curation.

Current verified canonical target:

- 63 rule files, 64 ordered segments, 40 proxy groups;
- 7,818 rules including the unique FINAL;
- 206 destination-IP rules, all with `no-resolve`;
- zero same-segment exact duplicates and zero non-strict CIDRs;
- first-match unreachable union: 146; same-segment: 13; cross-segment-only: 133.

## ER-035 — Reconstruction scaffolding retired

**Type:** infrastructure retirement, no rule edits

The project now maintains and iterates its own corpus, so the tooling kept only to reconstruct and migrate the original profile no longer earns its place.

Removed:

- `scripts/reverse_profile.py`. The legacy importer had no remaining input: the credential-bearing expanded profile left the repository in ER-001, no profile ships in the tree, and no document presents the importer as a supported tool. Its `py_compile` step is dropped from CI and `LegacyImporterTests` (5 tests) goes with it.
- `tests/fixtures/phase-2-before.json`, `phase-2-after.json`, and `phase-2-migration-ledger.json`, with `PhaseTwoMigrationBaselineTests` (3 tests). These froze the ER-001 canonical-source migration and constrain nothing about the current product.

`test_first_match_coverage_metrics_are_frozen` keeps its real guard. Only the three "must be below the Phase 2 historical baseline" comparisons are dropped; the equality against the quality baseline and the explicit 146 / 13 / 133 assertions remain, so first-match coverage is still frozen.

Phase 3 is deliberately kept. `phase-3-recovery-ledger.json` is a required `next_gate` key in the quality-baseline contract enforced by `scripts/profile_model.py`, `PhaseThreeDirectRecoveryTests` validates the six late-recovery rulesets — 2,684 rules, 34.3 percent of the product — against a frozen selection replayed from a pinned commit, and `docs/PROVENANCE.md` cites `phase-3-after.json` and the recovery ledger as that corpus's evidence boundary. Removing them would retire a production guard and weaken a provenance record, not clear away scaffolding.

The two pinned MIT imports are likewise untouched. `china-domains-direct.list` and `advertising.list` carry 2,331 rules of `v2fly/domain-list-community` data; while that data ships, `NOTICE.md` and the two import ledgers discharge the `Copyright (c) 2018-2019 V2Ray` attribution and remain mandatory.

The suite goes from 61 to 53 tests. No rule, ruleset segment, proxy group, or generated artifact changes.

Current verified canonical target:

- 63 rule files, 64 ordered segments, 40 proxy groups;
- 7,818 rules including the unique FINAL;
- 206 destination-IP rules, all with `no-resolve`;
- zero same-segment exact duplicates and zero non-strict CIDRs;
- first-match unreachable union: 146; same-segment: 13; cross-segment-only: 133.

## ER-036 — Observation-derived advertising curation

**Type:** new ruleset segment funded by a same-policy consolidation

The pinned advertising import does not block what pages actually load. Measured against this repository's own observation of 21 origins, `advertising.list` covers 19 of the 260 observed third-party hosts — 7.3 percent. It misses the entire contemporary programmatic stack: Taboola, PubMatic, Magnite, OpenX, Index Exchange, TripleLift, Sharethrough, Equativ, Criteo, The Trade Desk, ID5, LiveRamp, LiveIntent, IntentIQ, Lotame, DoubleVerify, Integral Ad Science, Comscore, Permutive, and Tencent GDT. Separately, 84 of its 849 entries — 9.9 percent — no longer resolve anywhere, and 180 serve a Russian audience this product does not have.

`advertising-curated` is the first ruleset built entirely from this repository's own measurement. All 260 observed third-party hosts were reviewed one by one against the admission criteria; the verdicts and their reasons are committed in `docs/evidence/admission-review-2026-09-19.json` as 110 admit, 137 reject, 13 hold. The 68 emitted rules carry the admitted hosts, consolidated to a registrable root only where the root is unambiguously advertising infrastructure.

Three findings from the review changed the output and are worth recording:

- A curated suffix must never shadow an existing rule. `baidustatic.com` and `mmstat.com` would have, so they are narrowed to the observed hosts; `baidustatic.com` also serves general Baidu static assets, and a root-level `REJECT` would have broken those pages.
- `logx.optimizely.com` is dropped. `dazn` already routes it to `🎬 Dazn`, so a `REJECT` would have broken Dazn.
- Twelve entries the import already covers are dropped as redundant.

The segment sits immediately after the import and shares its `🛑 广告拦截` policy, so ordering and default `REJECT` behavior are unchanged. First-match coverage is identical to before this change — union 146, same-segment 13, cross-segment 133 — because every rule that would have increased it was narrowed or removed.

The Subconverter 64-segment ceiling funds the new segment through a same-policy consolidation, the mechanism ER-023 established. `hbo-max` is concatenated into `hbo-go` without reordering under their shared `🎬 HBO GO/MAX` policy; the retired `hbo-max` Raw URL survives as a generated-only compatibility copy carrying its original 16 matchers behind frozen list and provider hashes, exactly as `spotify-2`, `onedrive`, and `icloud` do. Rule count, matcher order, and policy targets are unchanged by the merge.

The pinned import, its ledger, and its `emitted_sha256` are untouched. The `Copyright (c) 2018-2019 V2Ray` attribution therefore still stands: that data still ships. Retiring it requires replacing it, which this segment starts rather than completes.

Current verified canonical target:

- 63 rule files, 64 ordered segments, 40 proxy groups;
- 7,886 rules including the unique FINAL;
- 206 destination-IP rules, all with `no-resolve`;
- zero same-segment exact duplicates and zero non-strict CIDRs;
- first-match unreachable union: 146; same-segment: 13; cross-segment-only: 133.

## ER-037 — Publisher declarations widen the curated advertising corpus

**Type:** extension of an existing segment from a second first-party evidence source

ER-036 built `advertising-curated` from traffic observation alone. Observation shows what a page loaded but reaches breadth slowly: 21 origins yielded 141 third-party roots, and new roots per origin had not begun to saturate.

IAB ads.txt closes that gap. A publisher serves the file from its own root and lists every advertising system it authorises to sell its inventory, so the file is the publisher's own statement that a domain is advertising infrastructure. `scripts/ads_txt_evidence.py` collects them: 49 of 57 publishers served one, declaring 826 advertising systems, 545 of them by two or more publishers.

Declarations are candidates, not admissions, because the declared domain is the company selling inventory and often not the domain delivering advertising at runtime — OpenX declares `openx.com` but bids from `openx.net`, Xandr declares `appnexus.com` but serves from `adnxs.com`. A rule on a corporate website stops nothing, and rules that stop nothing are the defect this rebuild exists to remove. `scripts/ad_serving_probe.py` therefore resolves the delivery-shaped hostnames an advertising platform conventionally runs beneath each candidate root. Of 453 probed roots, 267 have live delivery infrastructure, 172 answer only on their apex, and 14 do not resolve.

Filtering before and after the probe removed, in order: 56 candidates that are publishers declaring themselves, mixed-business roots whose non-advertising functions a `REJECT` would break, or agency holding companies; then the 186 roots without live delivery; then 24 video and audio player platforms, because blocking those removes content rather than advertising and the fourth admission criterion cannot be satisfied for them. The remaining 243 roots plus 16 already-specific advertising hosts bring the segment to 327 rules.

Measured against the same evidence, with the pinned import alone and then with the import plus this segment:

| Target | Import | Import and curated |
|---|---:|---:|
| Third-party hosts observed on 21 origins | 7.3% | 42.3% |
| Hosts this repository reviewed as advertising | 16.4% | 99.1% |
| Advertising systems declared by two or more publishers | 1.7% | 51.2% |

First-match coverage is unchanged — union 146, same-segment 13, cross-segment 133. Not one of the 283 candidates shadowed an existing rule or was shadowed by one, so nothing needed narrowing this round. `logx.optimizely.com` is reclassified from admit to hold in the review record so the evidence matches what shipped; ER-036 dropped it because `dazn` routes it to its own policy.

The pinned import, its ledger and its `emitted_sha256` remain untouched, so the `Copyright (c) 2018-2019 V2Ray` attribution still stands.

Current verified canonical target:

- 63 rule files, 64 ordered segments, 40 proxy groups;
- 8,145 rules including the unique FINAL;
- 206 destination-IP rules, all with `no-resolve`;
- zero same-segment exact duplicates and zero non-strict CIDRs;
- first-match unreachable union: 146; same-segment: 13; cross-segment-only: 133.

## ER-038 — Wider publisher sample for the curated advertising corpus

**Type:** extension of an existing segment from the same evidence source

ER-037 polled 57 publishers. Publisher choice is not derived from any rule list — publishers are public entities — so the sample can widen freely. It now spans 235 publishers across news, technology, sport, finance, entertainment, lifestyle and gaming in North America, the United Kingdom, western Europe, greater China, Japan, Korea, India, Oceania and Latin America. 198 served an `ads.txt`, declaring 1,194 advertising systems, 910 of them by two or more publishers.

Of 638 candidates the curated segment did not already cover, the delivery probe found 239 with live infrastructure, 371 with a corporate website only, and 28 that do not resolve. Review then removed 38 mixed-business roots whose non-advertising functions a `REJECT` would break, 28 publishers and media groups, 6 agency and holding companies, and 36 video and audio player platforms. The remaining 131 roots bring the segment to 452 rules.

Six of those initially duplicated entries already in the pinned import. The round's coverage check compared candidates against the curated segment but not against the import, so the duplicates were only caught by the first-match metric afterwards. Future rounds compare against both.

Measured against the same evidence, with the pinned import alone and then with the import plus this segment:

| Target | Import | Import and curated |
|---|---:|---:|
| Third-party hosts observed on 21 origins | 7.3% | 42.3% |
| Hosts this repository reviewed as advertising | 16.5% | 100.0% |
| Advertising systems declared by two or more publishers | 1.3% | 44.9% |

First-match coverage is unchanged — union 146, same-segment 13, cross-segment 133.

An audit of the import establishes what retiring it would still cost. Of its 849 entries, 84 no longer resolve and 4 are already covered here, so 761 carry live coverage this segment does not yet reproduce. Only 5.9 percent of those appear in the widened declarations, because the two sources describe different slices: `ads.txt` maps the programmatic supply chain, while the import's remaining strength is mobile SDK and platform-native advertising endpoints — `app-measurement.com`, `admob.com`, `2mdn.net`, `ads-twitter.com`, ByteDance's `zijieapi.com`, Kuaishou's `adkwai.com` — plus 96 Russian and 68 mainland Chinese entries. Reaching those needs a third evidence source, so the import stays and the attribution with it.

Current verified canonical target:

- 63 rule files, 64 ordered segments, 40 proxy groups;
- 8,270 rules including the unique FINAL;
- 206 destination-IP rules, all with `no-resolve`;
- zero same-segment exact duplicates and zero non-strict CIDRs;
- first-match unreachable union: 146; same-segment: 13; cross-segment-only: 133.

## ER-039 — Observation-derived mainland direct curation

**Type:** extension of an existing segment from a new evidence source

Major mainland services were reaching the proxy fallback. `zol.com.cn`, `ifeng.com`, `eastmoney.com`, `csdn.net`, `ithome.com`, `cnblogs.com`, `suning.com` and `dangdang.com` matched no rule in the product, so their traffic left the country and came back. The pinned mainland import is 1,482 entries and did not cover them.

Browser capture cannot reach the breadth this needs, so `scripts/page_host_scan.py` reads the hostnames an origin's markup references instead. It is far less precise — it misses anything a script builds at runtime — but it scales to hundreds of origins, and for deciding which services a site belongs to that is the trade worth making. 182 of 245 mainland origins were scanned, yielding 5,118 distinct hostnames across 1,269 registrable roots, 922 of them matching no existing rule.

Observation supplies candidates; it cannot decide them, because a mainland page also references foreign fonts, libraries and advertising. The decision comes from a primary source. APNIC publishes the registry's own delegation records, so the ranges allocated to CN are authoritative rather than inferred, and `scripts/mainland_hosting_probe.py` admits a root only when every A record falls inside them. Of the 922 candidates, 600 are mainland-hosted, 255 foreign, 4 mixed and 63 do not resolve.

Review then removed 11 mainland advertising and analytics roots — `umeng.com`, `growingio.com`, `admaster.com.cn`, `analysys.cn`, `cmgadx.com` among them — because they belong to the advertising policy rather than a direct one, 4 malformed roots the scanner produced, and `pplive.com`, which would have shadowed `afp.pplive.com` in `china-media-late-recovery`. The remaining 584 join `china-web`, taking it from 370 to 954 rules.

A first attempt at filtering also flagged long domain labels as random strings and would have dropped `cankaoxiaoxi.com`, `wallstreetcn.com` and `yingjiesheng.com`. The heuristic was wrong and was replaced by an explicit list.

First-match coverage is unchanged — union 146, same-segment 13, cross-segment 133.

The mainland import remains untouched, and so does its attribution. This curation is additive: it covers what the import missed rather than reproducing what it holds.

Current verified canonical target:

- 63 rule files, 64 ordered segments, 40 proxy groups;
- 8,854 rules including the unique FINAL;
- 206 destination-IP rules, all with `no-resolve`;
- zero same-segment exact duplicates and zero non-strict CIDRs;
- first-match unreachable union: 146; same-segment: 13; cross-segment-only: 133.

## ER-040 — Second mainland crawl round

**Type:** extension of an existing segment from the same evidence source

ER-039 scanned 245 mainland origins chosen directly. The roots it confirmed are themselves mainland services, so they seed the next round without leaving this repository's own observation. 373 of 528 such origins were scanned, yielding 8,347 hostnames across 2,790 registrable roots, 2,018 of them matching no existing rule.

The APNIC probe found 1,253 mainland-hosted, 592 foreign, 10 mixed and 163 unresolved. Review removed seven mainland advertising and measurement roots — `umeng.com`, `growingio.com`, `analysys.cn`, `miaozhen.com`, `irs01.com`, `sensorsdata.cn` and `tagtic.cn` — because they belong to the advertising policy, and `pplive.com`, which would have shadowed `afp.pplive.com`. The remaining 1,245 take `china-web` from 954 to 2,199 rules.

First-match coverage is unchanged — union 146, same-segment 13, cross-segment 133. The additions are disjoint from the pinned import by construction: a candidate is only considered when no existing rule covers it, and the import is an existing rule. That is also why retiring the import would still cost 1,448 live entries. Reaching those is a matter of crawling further, not of method.

Current verified canonical target:

- 63 rule files, 64 ordered segments, 40 proxy groups;
- 10,099 rules including the unique FINAL;
- 206 destination-IP rules, all with `no-resolve`;
- zero same-segment exact duplicates and zero non-strict CIDRs;
- first-match unreachable union: 146; same-segment: 13; cross-segment-only: 133.

## ER-041 — Certificate Transparency reaches vendor infrastructure

**Type:** extension of an existing segment from a new evidence source

Crawling further stopped paying. A third crawl round scanned 855 origins and confirmed 3,450 mainland roots, but an audit showed why that does not retire the pinned import: the import's remaining strength is the backend, sub-brand and infrastructure domains large vendors operate — `servicewechat.com`, `byteacct.com`, `alipaylog.com`, `jdcloud-oss.com`, `bytedns5.com` — and no homepage links to those, so no amount of homepage scanning reaches them.

Certificate Transparency does. Every publicly trusted certificate is logged together with the organisation it was issued to, so querying the log by organisation returns the domains a vendor proved control of to a certificate authority. That is the vendor's own attestation, obtained from a primary source, not a third party's compilation. `scripts/vendor_domain_discovery.py` performs the query; the verdict on whether a discovered root belongs on a direct policy still comes from the APNIC probe.

46 mainland vendors attest 1,711 registrable roots. 1,333 match no existing rule, and of those 480 are mainland-hosted. Separately, the third crawl round contributes 526 roots referenced by two or more independent origins — the threshold exists because at this depth a crawl reaches long-tail links whose marginal value does not justify the bloat. Six mainland measurement roots were removed as belonging to the advertising policy. The remaining 997 take `china-web` from 2,199 to 3,196 rules.

The audit that motivated the change also measures progress against it. Of the import's 1,448 live entries, 279 are now independently attested through Certificate Transparency and 216 through this repository's own crawl, 408 once deduplicated — 28.2 percent. The remaining 1,040 are vendor-affiliated domains under obscure names, which the same method reaches with a wider organisation list.

First-match coverage is unchanged — union 146, same-segment 13, cross-segment 133.

Current verified canonical target:

- 63 rule files, 64 ordered segments, 40 proxy groups;
- 11,096 rules including the unique FINAL;
- 206 destination-IP rules, all with `no-resolve`;
- zero same-segment exact duplicates and zero non-strict CIDRs;
- first-match unreachable union: 146; same-segment: 13; cross-segment-only: 133.

## ER-042 — Shared SaaS narrowed out of single-service policies

**Type:** overbreadth removal, no new rules

A regression check over functional hostnames found `static.zdassets.com` routed to `🎬 韩国媒体`. The rule sits beside `watcha.zendesk.com`, so its origin is clear — Watcha runs its help centre on Zendesk — but `zdassets.com` is Zendesk's global asset CDN. Every site using Zendesk was being pulled into a Korean streaming policy.

An audit of the same shape across all service-specific rulesets found 50 references to shared third-party infrastructure. Most are correctly scoped: `bahamut.akamaized.net`, `hboasialive.akamaized.net`, `disney.my.sentry.io` and the CloudFront distributions name one tenant each. Six were not, and all six are telemetry or marketing services the streaming product does not need in order to play:

| Removed | From | Shared with |
|---|---|---|
| `zdassets.com` | `media-korea` | every Zendesk help centre |
| `launches.appsflyer.com` | `media-korea` | every app using AppsFlyer attribution |
| `sdk.iad-05.braze.com` | `media-korea` | every app using Braze messaging |
| `ipv4.cws.conviva.com`, `ipv6.cws.conviva.com` | `media-korea` | every streamer using Conviva |
| `braze.com`, `conviva.com` | `disney-plus` | as above, at root scope |
| `js-agent.newrelic.com` | `disney-plus` | every site using New Relic browser monitoring |

Three further shared endpoints are kept deliberately. `execute-api.us-east-1.amazonaws.com`, `cognito-identity.us-east-1.amazonaws.com` and `mobileanalytics.us-east-1.amazonaws.com` are AWS regional endpoints where the tenant is identified by credentials rather than by hostname, so no narrower form exists, and viuTV's sign-in depends on Cognito. The overbreadth is real and unavoidable; removing them would break the services these rulesets exist to serve.

`js-agent.newrelic.com` was already unreachable — the pinned advertising import covers it and runs first — so removing it takes the intentional cross-segment capture count from 40 to 39 and the advertising routing ledger is re-sealed, the mechanism ER-031 established. First-match coverage falls from 146 to 145 accordingly, which the gate permits: it may not increase.

This round also repairs a defect ER-039 introduced. Rewriting `china-web.list` dropped its trailing newline, which broke `test_direct_default_domain_keyword_is_rejected` — the test appends a matcher and the missing newline fused it onto the last rule. The failure went unnoticed for three commits because the verification command printed the test count without the pass or fail line. Trailing newlines now match what each file carried on `main`.

Current verified canonical target:

- 63 rule files, 64 ordered segments, 40 proxy groups;
- 11,088 rules including the unique FINAL;
- 206 destination-IP rules, all with `no-resolve`;
- zero same-segment exact duplicates and zero non-strict CIDRs;
- first-match unreachable union: 145; same-segment: 13; cross-segment-only: 132.

## ER-043 — Wider vendor sample for Certificate Transparency discovery

**Type:** extension of an existing segment from the same evidence source

ER-041 queried 46 organisations. A wider list of 118 covers telecommunications carriers, handset makers, game studios, AI companies, cloud providers and the sub-brands of the large platforms. crt.sh throttles bursts and answers an over-eager client with an empty body, which is indistinguishable from an organisation having no certificates, so the tool now retries with a growing pause; 72 organisations that appeared to have nothing returned results on retry.

The wider sample attests 2,338 registrable roots. 1,394 match no existing rule, of which 74 are mainland-hosted — the earlier 480 are already in the ruleset. One measurement root is removed as belonging to the advertising policy. The remaining 73 take `china-web` to 3,269 rules with first-match coverage unchanged at union 145.

Both imports are now measured against the full independent evidence pool:

| Import | Live entries | Independently attested | Still missing |
|---|---:|---:|---:|
| `china-domains-direct.list` | 1,448 | 461 (31.8%) | 987 |
| `advertising.list` | 765 | 215 (28.1%) | 550 |

Neither import can be retired, so the `Copyright (c) 2018-2019 V2Ray` attribution stands. What has changed is that the product no longer depends on them for quality: the curated segments outperform the advertising import on every measured axis and cover mainland services it never held.

Current verified canonical target:

- 63 rule files, 64 ordered segments, 40 proxy groups;
- 11,161 rules including the unique FINAL;
- 206 destination-IP rules, all with `no-resolve`;
- zero same-segment exact duplicates and zero non-strict CIDRs;
- first-match unreachable union: 145; same-segment: 13; cross-segment-only: 132.

## ER-044 — Russian publishers, and a scanner anchored against script noise

**Type:** extension of an existing segment, plus a tool defect fix

A fifth of the advertising import serves a Russian audience. Reproducing that coverage independently needs Russian publishers, and publisher choice carries no dependency on anyone's rule list, so the same `ads.txt` method applies unchanged. 48 of 75 Russian publishers served one, declaring 439 advertising systems, 273 by two or more.

Of 126 candidates the curated segment did not cover, the delivery probe found 37 with live infrastructure. Review removed eight mixed-business roots, one publisher, one agency and ten video player platforms, leaving 17: `adhigh.net`, `adriver.ru`, `adtarget.me`, `bidvol.com`, `byyd.me`, `clickonometrics.pl`, `getintent.com`, `mobuppsrtb.com`, `mobydix.com`, `persona.ly`, `redllama.ru`, `relap.io`, `rtbsape.com`, `sape.ru`, `tds.bid`, `totalmediasolutions.com` and `upravel.com`. The segment reaches 469 rules and 28.4 percent of the import's live Russian entries are now independently attested.

The round also fixes a defect in `page_host_scan.py`. Its pattern anchored on a bare `//`, and minified JavaScript ends statements with trailing comments such as `}//console.log(x)`, so the text after the slashes was read as a hostname. The pattern now requires either an explicit scheme or a delimiter that genuinely precedes a URL. No rule was affected: every candidate passes the APNIC probe before admission, and the noise never resolved.

First-match coverage is unchanged at union 145.

Current verified canonical target:

- 63 rule files, 64 ordered segments, 40 proxy groups;
- 11,178 rules including the unique FINAL;
- 206 destination-IP rules, all with `no-resolve`;
- zero same-segment exact duplicates and zero non-strict CIDRs;
- first-match unreachable union: 145; same-segment: 13; cross-segment-only: 132.

## ER-045 — Subject alternative names expose sibling domains

**Type:** extension of an existing segment from the same evidence source

Querying Certificate Transparency by organisation depends on guessing how a vendor's certificates are registered, and large vendors register under many names — ByteDance's certificates sit under Douyin, Volcano Engine and Lemon Inc. as well as its own. Querying by domain avoids the guess. A certificate covers every name it was issued for, so a multi-domain certificate for a vendor's main domain names the siblings it runs under unrelated-looking names: `bytedance.com` returns `bytedance.net`, `feishu.cn`, `larksuite.com` and `tiktok.com`.

The tool now reads a term containing a dot as a domain and searches with `q` rather than `O`. 797 seeds — every mainland-hosted root confirmed so far, plus the origins of the first scan — attest 5,456 registrable roots, against 2,338 from the organisation search.

3,424 match no existing rule; the APNIC probe finds 628 mainland-hosted, 1,241 foreign and 1,553 unresolved. One measurement root is removed as belonging to the advertising policy, leaving 627. `china-web` reaches 3,896 rules with first-match coverage unchanged at union 145.

Progress against the imports, measured over the full independent evidence pool:

| Import | Live entries | Independently attested | Still missing |
|---|---:|---:|---:|
| `china-domains-direct.list` | 1,448 | 480 (33.1%) | 968 |
| `advertising.list` | 765 | 236 (30.8%) | 529 |

The subject-alternative-name harvest added 627 rules but moved the mainland import's attestation by only 1.3 points, because it finds a different set of mainland domains rather than the import's. That gap is the honest shape of the remaining work.

Current verified canonical target:

- 63 rule files, 64 ordered segments, 40 proxy groups;
- 11,805 rules including the unique FINAL;
- 206 destination-IP rules, all with `no-resolve`;
- zero same-segment exact duplicates and zero non-strict CIDRs;
- first-match unreachable union: 145; same-segment: 13; cross-segment-only: 132.

## ER-046 — Following scripts, and where the crawl saturates

**Type:** extension of an existing segment, plus a tool capability

A page's markup names its CDN and image hosts. The endpoints an application actually calls are built inside its script bundles, and a browser comparison shows the size of the gap: Taobao's markup names about two dozen hosts, and following its scripts reaches 108. Douyin's runtime requests include `zijieapi.com`, `bytetos.com`, `bytescm.com`, `bytegoofy.com`, `ibytedapm.com` and `bytednsdoc.com`, and `zijieapi.com` is one of the entries the pinned import holds without independent attestation.

`page_host_scan.py` now follows the first few scripts each page declares. Re-running the 2,017 known mainland origins reaches 30,974 hostnames across 9,726 roots, against roughly 18,000 hostnames before. The APNIC probe finds 3,096 of 6,317 uncovered candidates mainland-hosted.

Only 92 of those 3,096 are referenced by two or more independent origins. The rest are single-reference long-tail local sites — `0052500.com`, `0554zp.com`, `0797rs.com` — that a friendly-links section on a scanned page happens to name. Admitting them would add three thousand rules of the bloat this rebuild exists to remove, so the threshold holds: nine measurement roots and one shadowing root are removed from the 92, and the remaining 82 take `china-web` to 3,978 rules.

That ratio is the round's real finding. The crawl has saturated on valuable discovery; further crawling returns noise rather than the import's content.

Measured over the full independent evidence pool:

| Import | Live entries | Independently attested | Still missing |
|---|---:|---:|---:|
| `china-domains-direct.list` | 1,448 | 494 (34.1%) | 954 |
| `advertising.list` | 765 | 427 (55.8%) | 338 |

First-match coverage is unchanged at union 145.

Current verified canonical target:

- 63 rule files, 64 ordered segments, 40 proxy groups;
- 11,887 rules including the unique FINAL;
- 206 destination-IP rules, all with `no-resolve`;
- zero same-segment exact duplicates and zero non-strict CIDRs;
- first-match unreachable union: 145; same-segment: 13; cross-segment-only: 132.

## ER-047 — The pinned imports are retired and the attribution with them

**Type:** product boundary change; two segments removed, one added

The product no longer ships `v2fly/domain-list-community` data. `china-domains-direct.list` and `advertising.list` are deleted, their import ledgers and the advertising routing ledger with them, and `NOTICE.md` no longer carries the `Copyright (c) 2018-2019 V2Ray` attribution, because nothing in the product requires it.

### Why now

Full independent reproduction of the imports was attempted and does not converge. Six evidence sources took independent attestation of their live entries to 34.1 percent for the mainland import and 55.8 percent for the advertising one, and then saturated: a third crawl round confirmed 3,096 mainland roots of which only 92 were referenced by more than one origin, and a subject-alternative-name harvest added 627 rules while moving attestation by 1.3 points. What the imports still hold is mobile SDK endpoints, vendor backend domains and platform-native advertising hosts that neither public web traffic nor certificate logs reach from here.

So the choice was not between reproducing them and keeping them. It was between keeping data the product no longer depends on for quality, and replacing it with a corpus that measures better. Against this repository's own evidence:

| Target | Retired import | Curated replacement |
|---|---:|---:|
| Third-party hosts observed on 21 origins | 7.3% | 42.3% |
| Hosts reviewed as advertising | 16.5% | 100% |
| Advertising systems declared by two or more publishers | 1.3% | 44.9% |
| Hostnames observed across 2,017 mainland origins | 7.7% | 60.9% |
| Mainland origins scanned | 2.7% | 93.4% |

### Closing the measurable gap first

Retiring the imports outright would have cost coverage for 2,504 observed hostnames, including `baidu.com`, `163.com`, `126.net`, `7fresh.com` and `jddj.com`, which no other segment carried. Those domains were in this repository's own observation all along; the candidate filter had simply skipped them because an existing rule — the import — already covered them. 239 such roots were recovered, 163 confirmed mainland-hosted by APNIC and 61 admitted by per-host review after the probe could not answer for services on global CDNs. Two more, `cmpassport.com` and `jimeng.com`, were found by re-running the repository's own routing tests. Measured loss fell from 7.7 percent of observed hostnames to 2.0, and then to zero: the last 41 roots were added explicitly, 16 to advertising and 24 to mainland direct.

One deliberate exception: `newrelic.com` is not re-added. The import blocked it; this repository's review classifies browser monitoring as neither advertising nor tracking, and the hold stands over parity.

### Ordering is semantics

Adding broad vendor roots to `china-web` broke cloud, media and AI routing — `cloud.baidu.com` reached the mainland web policy instead of mainland cloud, because `china-web` runs at 49 and `china-cloud` at 58, while the retired import ran at 62. The new `china-direct-curated` segment restores that ordering: nine broad roots sit immediately before the GEOIP fallback, exactly where the import used to be. Routing for `cloud.baidu.com`, `console.cloud.tencent.com`, `intl.cloud.tencent.com` and `music.126.net` is verified unchanged.

### Shape

The product goes from 63 rule files to 62 and from 11,887 rules to 9,831. First-match unreachable coverage falls from 145 to 54, same-segment stays at 13, cross-segment falls from 132 to 41 — the imports were the source of most dead rules. Intentional cloud captures fall from 71 to 19 and the cloud routing ledger is re-sealed; the advertising capture ledger is deleted along with the segment it described.

Current verified canonical target:

- 62 rule files, 63 ordered segments, 40 proxy groups;
- 9,831 rules including the unique FINAL;
- 206 destination-IP rules, all with `no-resolve`;
- zero same-segment exact duplicates and zero non-strict CIDRs;
- first-match unreachable union: 54; same-segment: 13; cross-segment-only: 41.

## ER-048 — The admission review is a contract, and it was not being honoured

**Type:** defect fix; 8 rules added, 2 removed

`docs/evidence/admission-review-2026-09-19.json` records a per-host verdict for 260 observed hosts. 109 are `admit`, meaning this repository reviewed the host and decided it should be blocked. After ER-047 removed the import, eight of those 109 no longer reached `advertising-curated`:

| Host | Was reaching | Via |
|---|---|---|
| `www.googletagmanager.com` | 🌏 国内网站 | `DOMAIN-SUFFIX,googletagmanager.com` in `china-web` |
| `www.googletagservices.com` | 🌏 国内网站 | `DOMAIN-SUFFIX,googletagservices.com` in `china-web` |
| `beacon.cdn.qq.com` | 🌏 国内网站 | `DOMAIN-SUFFIX,qq.com` in `china-direct-curated` |
| `mi.gdt.qq.com` | 🌏 国内网站 | `DOMAIN-SUFFIX,qq.com` in `china-direct-curated` |
| `sdk.e.qq.com` | 🌏 国内网站 | `DOMAIN-SUFFIX,qq.com` in `china-direct-curated` |
| `hm.baidu.com` | 🌏 国内网站 | `DOMAIN-SUFFIX,baidu.com` in `china-direct-curated` |
| `cpro.baidustatic.com` | 🌏 国内网站 | `DOMAIN-SUFFIX,baidustatic.com` in `china-web` |
| `pgdt.gtimg.cn` | 🌏 国内网站 | `DOMAIN-SUFFIX,gtimg.cn` in `china-web` |

Two different defects share one symptom.

The curated advertising set was built additively while the import still shipped, so it skipped hosts the import already covered. When the import left, those hosts had nothing behind them. That is a sequencing error in ER-047, not a judgement change: the review always said `admit`.

The Google entries are worse than an omission. `googletagmanager.com` appears in this repository's own `docs/evidence/ad-vendors-2026-09-19.txt`, and the round-2 review named it explicitly as advertising infrastructure. Carrying it as a mainland-direct suffix asserted the opposite of what the same repository had already concluded. Both roots are removed from `china-web` and added to `advertising-curated`, where the whole root is correct because tag delivery is their only function.

The six mainland hosts are added as exact `DOMAIN` rules. Their roots — `qq.com`, `baidu.com`, `baidustatic.com`, `gtimg.cn` — carry login, payment, platform APIs and general assets that must stay direct, so the per-host granularity the round-2 review established is what applies. `advertising-curated` runs at segment 4, well ahead of both mainland segments, so the exact hosts win.

The contract is now verified in both directions: all 109 `admit` hosts reach `advertising-curated`, and none of the 151 `hold` or `reject` hosts reach `REJECT`.

### The committed origin list had gone stale

`docs/evidence/cn-origins-2026-09-19.txt` was written once, during the 954-rule round, with 245 origins. Later rounds scanned a larger list that was never committed, so the ER-047 figure of 2,017 origins cited a file that could not produce it. The file is regenerated deterministically — every domain root the `china-web` segment carries, 4,206 origins — so the scan is reproducible from committed inputs. The measurement it feeds is re-derived in ER-049.

### Shape

62 rule files and 63 segments are unchanged; rules go from 9,831 to 9,837 including FINAL. First-match unreachable is unchanged at 54 / 13 / 41, so the added rules are all live.

## ER-049 — Mainland advertising, derived from this repository's own scan

**Type:** coverage; 85 rules added

ER-047 replaced an import whose advertising corpus was 27.7 percent mainland-related. The curated set that replaced it was built from Western publisher `ads.txt` declarations and traffic observation of 21 mostly international origins, so mainland advertising was the thinnest part of it. Routing the retired import's 849 advertising domains through the product showed 321 reaching a mainland direct policy that previously reached `REJECT`.

The candidates for this round come from this repository's own scan of 2,017 mainland origins — the same 30,974 hostnames the china-web curation was built from, read a second time for a different purpose. Three passes:

| Pass | Candidates | Admitted | Dead | Rejected |
|---|---:|---:|---:|---:|
| Advertising-delivery labels | 249 | 71 | 27 | 151 |
| Tracking and analytics labels | 133 | 37 | 6 | 90 |

`advertising-curated` goes from 494 to 587 rules; 85 of them are new in this ER, and the admitted counts above include hosts earlier rounds had already covered, because ER-050 rebuilt the evidence so that `admit` means exactly "this host first-matches `advertising-curated`". First-match unreachable is unchanged at 54 / 13 / 41, so every added rule is live.

### Label shape is a candidate generator, never an admission

The rejection counts are the finding. A leading `ad`, `bid` or `ssp` label is wrong far more often than it is right on mainland origins:

- `cn.unionpay.com` is China UnionPay, matched on `union`
- `www.gdtv.cn` and `gdtoday.newsgd.com` are a Guangdong broadcaster and news site, matched on `gdt` — which elsewhere means Tencent 广点通
- `ta.wikipedia.org` is Tamil Wikipedia, matched on `ta`, referenced by an online-course site
- `stats.gd.gov.cn`, `stats.customs.gov.cn` and `report.12377.cn` are government statistics bureaus and the reporting centre mainland sites are required to link in their footer, so they appear across unrelated origins and pass a cross-site test
- 53 hosts under `bidcenter.com.cn` and `bidchance.com` are public procurement portals, where `bid` means tendering
- `ssports.iqiyi.com` is iQIYI Sports and `sspai.com` is a technology publication, both matched on `ssp`

Requiring third-party status to at least one observing origin — criterion 2 of the admission rules — removes 51 of the tracking candidates but keeps every government and Wikipedia case, because footer links and language editions are third-party by construction. Per-host review remains the only thing that separates them.

Two deliberate holds carry forward: `retcode.taobao.com` is browser error monitoring, held for the same reason as `newrelic.com`, and first-party `stat.`, `log.` and `pv.` endpoints on a single operator's own site are not admitted, including on financial hosts such as `collect.mybank.cn` and `log.cmbchina.com`, where a `REJECT` could stall a checkout and first-party safety cannot be established.

### What this does not reach

Of the retired import's advertising domains, 305 still reach a mainland direct policy. 270 of them appear nowhere in the 30,974 hostnames this repository has observed: they are mobile application and SDK endpoints, which a scan of the web cannot see. That is the same boundary ER-047 recorded, stated for advertising specifically — the curation covers what mainland pages actually load, and does not claim to cover what mainland apps call.

One rule was withdrawn during this round for provenance rather than evidence. `beacon.qq.com` was admitted from a cross-check against the retired import, then removed on discovering the scan never saw that hostname; the two endpoints it did see, `oth.str.beacon.qq.com` and `otheve.beacon.qq.com`, are what ship. A candidate that only the import can supply is not this repository's own evidence.

## ER-050 — Criterion 2 was wrong, and the evidence could disagree with the product

**Type:** defect fix; admission criteria amended, evidence derivation changed, 4 tests added

Review of ER-049 raised two inconsistencies. Both were real, and the second one turned out to be the smaller half of a defect in the criteria themselves.

### The evidence could contradict the rules

`cn-ad-review-2026-09-19.json` recorded `reject` for `cpro.baidustatic.com` and `mi.gdt.qq.com` while `advertising-curated` shipped a rule for each. The file was generated from a hand-kept list of that round's admissions, so any host admitted in an earlier ER fell through to the catch-all `reject`. The file read as evidence while describing something that was never published.

The fix is structural rather than editorial. Every verdict is now derived from the shipped corpus: `admit` means `advertising-curated` is what the host first-matches. The file cannot disagree with the product, because the product is what generates it.

### Criterion 2 could not admit a publisher's own advertising

The second point was that `analytics.163.com`, `btrace.qq.com` and `bzclk.baidu.com` were admitted with a cross-site rationale while this repository's scan only ever saw them on their operator's own site. That is true. Withdrawing them was the first response, and it was wrong — it exposed that 29 already-shipped rules had the same shape: `ad.sohu.com`, `ad.cnki.net`, `cpro.zol.com.cn` and other publisher ad subdomains, none of them third-party to anything.

Criterion 2 read "third-party to at least one observing origin". That wording came from a corpus of Western third-party ad tech, where every candidate was third-party by construction. It does not survive contact with mainland origins, where a large share of advertising is served from the publisher's own `ad.` subdomain. Read literally it forbids blocking a publisher's own ad host, which is most of what ad blocking is.

Criterion 2 now admits either route: third-party to an observing origin, or a dedicated advertising or tracking endpoint of the operator whose site referenced it. Each admitted record states which route applies — 76 third-party, 32 own-endpoint.

Nothing protective was lost, because criterion 2 was never what stopped the dangerous cases. `stats.gd.gov.cn`, `report.12377.cn` and `ta.wikipedia.org` are third-party across unrelated origins and are rejected by criterion 3. `collect.mybank.cn` and `log.cmbchina.com` are rejected by criterion 4. The protection lives in per-host review and the first-party-safety rationale, exactly where the round-2 finding put it.

### Both are now enforced

`AdvertisingAdmissionContractTests` asserts four invariants: every `admit` in the admission review reaches `advertising-curated`, no `hold` or `reject` reaches it, every verdict in the mainland review matches the shipped corpus in both directions, and every admitted host records its admission route. The suite goes from 49 to 53 tests.

Three stale constants naming ER-047's deleted fixtures are removed from the test module.

## ER-051 — The reverse direction, and criterion 1

**Type:** defect fix; 1 evidence file added, criterion 1 amended, 1 test added

Three more inconsistencies were raised in review. All three were real, and the first one was the serious one.

### The bidirectional test was not bidirectional

ER-050 added a test described as checking both directions. It iterated the review records and asserted the product honoured them, which only proves that the records *that still exist* are honoured. Deleting a record left every test green while its rule kept shipping.

The gap was not hypothetical. Enumerating the published rules against the committed evidence found 28 with no record in any review file: `clarity.ms`, `sensorsdata.cn`, `zhugeio.com`, `51.la`, `wwads.cn`, the Alibaba `adashx.ut.*` tracking endpoints and others. They are legitimate — `git log -S` places them in commit `78c939c`, "Add audited ad blocking", where they were audited at the time — but audited in a commit message is not a committed per-host record, and criteria 3 and 4 ask for one.

`docs/evidence/legacy-ad-review-2026-09-19.json` now carries all 28, each re-reviewed with what the endpoint is and why a `REJECT` cannot break first-party behaviour. `test_every_published_advertising_rule_maps_to_committed_evidence` walks the shipped rules and requires each to map to an admitted review record or a publisher declaration, resolving suffix rules against any evidenced host beneath them. Deleting the `zhugeio.com` record now fails the suite.

One of the 28 nearly became a different defect. `adash.man.aliyuncs.com` has no A record, and on that basis it was removed as dead — which broke `test_domestic_and_overseas_cloud_routing_is_region_aware`. The rule is not dead: it holds an ordering contract, keeping that host out of the `aliyuncs.com` cloud policy. It is restored, and its record says so. Resolvability is evidence about a host, not about what a rule is for.

### Criterion 1 named only the first evidence route

Criterion 1 read "the host appears in a committed observation capture". Traffic observation was the first route this repository built and the wording froze it as the only one, which the corpus never matched: 421 of the shipped advertising rules arrive through the `ads.txt` declaration and delivery-probe route, and most of `china-web` through Certificate Transparency and APNIC, all documented under Method and none admissible under criterion 1 as written. `DOMAIN-SUFFIX,33across.com` is the example given in review. The criterion now names every route the Method section describes.

That is the second criterion this PR has had to amend after finding the corpus outside it. Both were written early, against the first corpus each was applied to, and neither was re-read when the evidence base widened.

### Rationales contradicted their own verdicts

The three records restored in ER-050 kept the reason string from their brief withdrawal, so each said "criterion 2 of the admission rules is not met" beside an `admit` verdict and an own-endpoint route. The regeneration carried the prior reason forward without checking it still applied. Reasons are now regenerated from the route, every admitted record carries a `first_party_safety` rationale, and the route test asserts all three agree rather than merely checking the field is non-empty.

## ER-052 — Seeds are not verdicts, and two ad roots were hiding behind the import

**Type:** defect fix; 2 rules reclassified, 1 narrowed, evidence tightened

Auditing the three areas flagged for the fourth review found three defects, one of which is a routing regression this PR introduced.

### DoubleClick and Firebase were reaching mainland direct

`DOMAIN-SUFFIX,2mdn.net` and `DOMAIN-SUFFIX,app-measurement.com` have been in `china-web` since `f1adf15`, the repository's first commit. They never mattered, because the retired import's advertising segment ran at position 4 and captured them long before `china-web` at 49. Retiring the import removed the mask and left Google Ad Manager creative delivery and Firebase Analytics collection routed to 🌏 国内网站 as ordinary mainland websites.

Both move to `advertising-curated`, where their function has always belonged. The search that found them is bounded and was run over the whole product: exactly four rules in `china-web` and `china-direct-curated` were covered by the retired import's advertising list. The other two, `51y5.net` and `qhupdate.com`, are correct as they stand — the specific advertising hosts beneath them, `lpms.51y5.net` and `s.qhupdate.com`, are blocked while the roots stay direct, which is the per-host granularity this repository has applied since round 2.

### A reviewed host does not justify blocking its root

ER-051's mapping test accepted a suffix rule when any reviewed or declared host sat beneath it. `mi.gdt.qq.com` is reviewed, so that rule would have accepted `DOMAIN-SUFFIX,qq.com` — the exact over-block the per-host principle exists to prevent. 25 shipped rules relied on that fallback.

The test now requires the rule's own value to be evidenced. 24 of the 25 are roots whose whole registrable root is advertising infrastructure, and each gets a record in the new `ad-root-review-2026-09-19.json` saying why no other service lives under it. The 25th, `app-us1.com`, is narrowed to the two hosts the admission review actually examined: its apex does not resolve but `www` does, and ActiveCampaign infrastructure could not be shown to be advertising-only.

### Seeds and candidates were being read as evidence

The mapping test counted `ad-vendors-2026-09-19.txt` and `adstxt-candidates-2026-09-19.txt` as evidence that a domain serves advertising. Neither is. The first is the seed list for Certificate Transparency queries — it names `bytedance.com`, whose general API infrastructure is plainly not advertising — and the second is a candidate list, which is what the delivery probe exists to adjudicate. Counting them made the test look stronger than it was.

Both are removed from the evidence set. What replaces them is the verdict the pipeline always produced but never committed: `ad-serving-probe-2026-09-19.json`, 1,995 roots with 791 confirmed serving, 767 corporate-site-only and 437 not resolving. Publisher declarations now count only at the two-or-more threshold this repository uses elsewhere.

That left 19 rules unmapped, all of them the canonical case the probe was written for — a platform's delivery domain is not the domain its publishers declare. Publishers declare `google.com` and the creatives arrive from `doubleclick.net`; `appnexus.com` is declared and `adnxs.com` bids. Each of the 19 now carries a root record naming the declared seller alongside the delivery root.

`china-web` and `china-direct-curated` remain outside this mapping. Their evidence is the APNIC delegation record and Certificate Transparency, and 3,770 of their 4,215 rules have a committed APNIC verdict; extending the test to them needs those verdicts committed as one consolidated file, which is a separate change.

## ER-053 — The mainland segments get the same contract, and two sets are named for what they are

**Type:** evidence; 3 evidence files added, 3 tests added

The fourth review round raised four points. All four were real.

### The mainland segments had no evidence contract at all

Advertising got a published-rule-to-evidence mapping in ER-051 because a wrong rule there blocks something a user wanted. A wrong rule in `china-web` sends traffic direct that should be proxied — the same class of defect with a quieter failure — and 4,224 rules had no such mapping, nor any committed artifact to map to. The scan output, the Certificate Transparency results and the APNIC verdicts existed only in a working directory, which makes the corpus unauditable and unreproducible: re-running a network probe later returns different data.

Three files now carry it, and `MainlandEvidenceContractTests` requires every rule in both mainland segments to map to one of them:

| Evidence | Rules |
|---|---:|
| `cn-apnic-verdicts-2026-09-19.json` — every A record inside APNIC's CN delegations | 3,778 |
| `cn-observation-2026-09-19.json` — seen by the scan, no APNIC verdict, admitted by per-host review | 177 |
| `cn-legacy-direct-2026-09-19.json` — grandfathered | 269 |

### Two grandfathered sets, named as such

The legacy advertising file claimed `admission_route: "third-party"` for hosts whose observing origin was never recorded. That was an assertion dressed as evidence. Those 28 rules entered in commit `78c939c` and their criterion 1 and 2 evidence cannot be reconstructed after the fact, so the file no longer claims a route: each record states `criteria_satisfied: [3, 4]` and `criterion_1_and_2_evidence: "not preserved"`. The 269 mainland rules in the same position are treated identically.

Both sets are **closed**. A test asserts each may shrink but never grow, and the mapping tests treat membership as evidence only for the exact values enumerated. Grandfathering rules already shipping and re-reviewed for safety is defensible; leaving a door open for new ones to enter that way is not.

The distinction between an input and a verdict is now written into `docs/SELF-OWNED-REBUILD.md` as well: `ad-vendors`, `adstxt-candidates`, `cn-candidates` and `cn-vendors` are seeds and candidate lists that the probes adjudicate, and no test may read them as a verdict.

### Admitted records carried rejection rationales

16 admitted delivery records still read "reviewed, not advertising delivery infrastructure" — the catch-all reject reason — beside an `admit` verdict, among them `ad.doubleclick.net`, `ib.adnxs.com` and six `mediav.com` hosts. They are admitted because a root rule captures them, and the regeneration had no branch for that. Reasons are now generated from the rule that actually matches, each record naming it in `captured_by`, and the consistency test rejects any admitted record whose reason carries rejection language rather than only the phrase `criterion 2`.

### `docs/PROVENANCE.md` still described the import as shipping

The advertising section stated that the curated segment sits after the pinned import, that the import's ledger and `emitted_sha256` are untouched, and that the attribution obligation is unaffected — all three deleted by ER-047 in the same change. It also cited the deleted `advertising-routing-ledger.json` and the pre-ER-047 count of 71 cloud captures. Corrected.

## ER-054 — Cloudflare's China network was missing its own domain

**Type:** coverage; 1 rule added

`china-cloud` carries the Cloudflare China infrastructure family — `cloudflare-cn.com`, `cloudflarechina.cn`, `cloudflarecn.net`, `cloudflareinsights-cn.com`, `cf-ns.com` and the rest — and not `cloudflare.cn`, the domain the service is actually named after. A mainland user reached it through the proxy while every sibling root went direct.

It joins its family in `china-cloud` rather than a mainland-direct segment, which is both where it belongs and what the evidence permits. The APNIC probe cannot adjudicate it: resolving `cloudflare.cn` from outside the mainland returns `223.26.56.104`, a Hong Kong address, because the China network answers differently depending on where the question is asked. That is a limit of this repository's probe, not a finding about the domain, and it is why ER-023's reviewed Cloudflare China roots live in `china-cloud` on review rather than on a probe verdict.

First-match coverage is unchanged.

## ER-055 — Overseas shopping becomes its own policy

**Type:** product shape; 1 segment and 1 group added, 76 rules

Takealot returns `403` with a Cloudflare interstitial from a proxy exit that other sites accept. That is not a country block — it is IP reputation, and the fix is a node the challenge does not flag. Reaching it meant changing `🐟 漏网之鱼` for everything, because a retailer that needs its own exit had nowhere else to go.

`🛒 海外购物` is that place. 76 roots: the regional Amazon storefronts, eBay and Etsy, Japanese shops including DLsite, Rakuten, ZOZO, Suruga-ya, Mandarake and AmiAmi, the forwarding services a cross-border order actually passes through — Buyee, ZenMarket, tenso — and regional retailers such as Gmarket, SSG, Musinsa and Takealot. What these sites display, what they will sell, and whether they challenge at all depends on which exit reaches them, which is the criterion this repository uses for a separate group rather than category tidiness.

### Placement is what keeps it safe

The segment runs at position 61, after every other service segment, so a broad root cannot take traffic that already has a home. `amazon.com` is the case that needs it: `aws.amazon.com` and `console.aws.amazon.com` stay in overseas cloud and `media-amazon.com` stays with Prime Video, because all three match earlier. Verified, along with Coupang staying under Korean media.

Four candidates were dropped rather than shipped. `lazada.com` is already in `china-web` with the rest of Alibaba's Lazada family, and adding it here created a dead rule the coverage gate caught — first-match unreachable rose from 54 to 55 and is back at 54. `lazada.sg`, `shopee.com` and `shopee.sg` went with it: splitting a brand whose mainland entry is deliberately direct across two policies is worse than leaving it whole.

### Cloudflare's performance domain

`cloudflareperf.com` joins `china-cloud` alongside the rest of the Cloudflare China family. Its apex is APNIC-confirmed mainland-hosted, unlike `cloudflare.cn` in ER-054, whose verdict the probe could not reach.

The product goes to 63 rule files, 64 segments, 41 proxy groups and 10,001 rules including FINAL. First-match coverage is unchanged at 54 / 13 / 41.

## ER-056 — The mainland probe was asking the wrong question

**Type:** method fix; 5 rules added, 1 evidence category added

A split-tunnel test showed ByteDance's row leaving through the proxy. Chasing it found the domains the test probes, and chasing those found something worse than a missing rule.

### The probe answered for its own location

`mainland_hosting_probe.py` resolved through a public resolver without saying who the answer was for, so a geo-DNS service answered for where the query came from. `xinhuanet.com` returns `156.238.128.x` to this repository and `117.177.70.x` to a mainland client; the probe read the first and called a China Mobile-hosted site foreign. That is the normal case for exactly the services a mainland direct rule is about — CDN-fronted, geo-resolved, and invisible to a probe run from outside.

The probe now names a mainland client subnet with EDNS Client Subnet. Four roots this repository had previously classified as foreign are mainland-hosted under the corrected question: `xinhuanet.com`, `chinanews.com.cn`, `honor.cn` and `cloudflareperf.com`. All but the last are added here; `cloudflareperf.com` was already placed in ER-055 by review and now has a verdict behind it.

The fix is not total, and the residue is informative. Cloudflare answers from anycast and returns the same address whatever subnet is named, so `cloudflare.cn` still has no verdict — a true finding about the method rather than about the domain. ER-054 recorded that as a limitation before the cause was understood; it now has a name.

### ByteDance, split by what the evidence actually says

The test probes `perfops.byte-test.com` and `perfops1` through `perfops3.byteperf.com`. Under the corrected probe they do not behave the same way:

| Host | Answer for a mainland client |
|---|---|
| `perfops.byte-test.com` | `218.91.225.98`, `114.80.10.195`, `182.101.26.190` — mainland |
| `perfops1.byteperf.com` | `35.219.10.74` — foreign |
| `perfops2.byteperf.com` | `95.40.53.40` — foreign |
| `perfops3.byteperf.com` | `47.84.187.31` — foreign |

So `byte-test.com` is admitted on the APNIC route and `byteperf.com` is not, because its endpoints are deliberately spread across regions — measuring only what is nearby would defeat their purpose. It is admitted anyway, on a rationale that is about routing rather than hosting: these are the endpoints a ByteDance client measures against to choose a CDN node, and a measurement taken through a proxy describes a path the media traffic will not take, so the client then picks the wrong node.

### A fourth evidence route, deliberately cramped

That rationale needed somewhere to live. `cn-review-admitted-2026-09-19.json` holds roots that neither the scan nor the probe can adjudicate, and it carries more proof than the other routes rather than less: each record must state the reason, the vendor attribution, and which limitation put it there, and `MainlandEvidenceContractTests` caps the category at eight records. It exists because two evidence routes have a blind spot, not because review outranks them. It currently holds one root.

`lenovo.com.cn` was examined and not added: it answers from Akamai's global edge even for a mainland client, so a direct rule would not shorten the path. `ant.design`, `vivo.com`, `honor.com` and `lenovo.com` are global sites and stay on the proxy.

First-match coverage is unchanged at 54 / 13 / 41.
## ER-057 — byteperf is not mainland, and the exemption it justified is withdrawn

**Type:** correction; 1 rule removed, 1 evidence category deleted

ER-056 admitted `byteperf.com` on a routing rationale after its own measurement said the endpoints answer from outside the mainland. The split-tunnel test that surfaced them labels those three rows 海外 and 国际, and with the rule shipping they reported a Hangzhou address — the product was forcing overseas measurement endpoints down the domestic path.

The measurement was right and the rationale was wrong. `perfops1` through `perfops3.byteperf.com` resolve to `35.219.10.74`, `95.40.53.40` and `47.84.187.31` for a mainland client because ByteDance spreads them across regions on purpose; that is the finding, and overriding it with an argument about what a measurement *ought* to traverse was reasoning past the evidence. The rule is removed. `byte-test.com` stays: it resolves into mainland space and was admitted on the APNIC route.

`cn-review-admitted-2026-09-19.json` is deleted with it. That category was created in ER-056 to hold exactly this one root, and a blind-spot patch with nothing in it is scaffolding, not a route. `MainlandEvidenceContractTests` is back to three evidence routes. If a future root genuinely needs review admission, the file comes back carrying that root's own justification rather than being kept warm for it.

## ER-058 — Remote streaming is two jobs, and one of them needs a proxy

**Type:** product shape; 1 segment and 1 group added, funded by consolidation

`🖥️ 远程串流` was DIRECT-first and held `DOMAIN-SUFFIX,tailscale.com`, so a browser opening the Tailscale admin console took the direct path and never arrived. The obvious fix — moving the suffix to a proxy policy — is wrong, and was reported to be wrong from the field: the DERP relays under that same suffix carry the streaming payload, and routing them through a proxy pushes a remote desktop session across the tunnel. Both facts hold at once because one suffix covers two jobs.

The policy is now two:

| Group | Default | Holds |
|---|---|---|
| `🖥️ 远程串流后台` | `♻️ 手动切换` | 19 console and website hosts across Tailscale, ZeroTier, NetBird, Parsec, RustDesk, AnyDesk, TeamViewer and Moonlight |
| `🖥️ 远程串流流量` | `DIRECT` | 65 data-plane rules: DERP relays, control planes, root servers, signalling, relay endpoints and the process names |

The admin segment runs immediately before the data segment, so an exact console host wins while the vendor suffix beneath it keeps carrying the payload direct. `login.tailscale.com` reaches the console policy; `derp1a.tailscale.com`, `controlplane.tailscale.com`, `abc.ts.net`, `root.zerotier.com`, `kessel-ws.parsec.app`, `rs-ny.rustdesk.com`, `net.anydesk.com`, `master1.teamviewer.com`, `signal.netbird.io` and `remotedesktop.google.com` all stay on the data policy. Verified per host.

Most vendors needed no rule change. Their entries were already precise data-plane hosts and their consoles were reaching the proxy through the fallback; naming them here moves them onto a policy that can be pointed at a working node instead of whatever the fallback happens to hold.

### Funding

The product sits at the Subconverter 64-segment ceiling, so the new segment is paid for the way ER-023 established. `xai` is concatenated into `ai-platforms`, three matchers appended without reordering. Routing cannot change, because every segment in that family targets `🧲 海外 AI`. The retired Raw URL survives as a generated-only compatibility copy of the `[22, 25)` slice behind frozen list and provider hashes, exactly as `hbo-max`, `spotify-2`, `onedrive` and `icloud` do.

## ER-059 — A session split across policies is the defect, not the exit it picks

**Type:** routing correctness; PlayStation, psnine and Honkai: Star Rail

Three reports this round were one defect wearing different clothes: a single page or a single game session reaching through two policies at once.

### PlayStation web images

`psnine.com` rendered with every cover image broken. `DOMAIN-SUFFIX,dl.playstation.net` sat in `game-download`, which is DIRECT-first so that a game download does not spend proxy bandwidth — but `psnobj.prod.dl.playstation.net` and `psn-rsc.prod.dl.playstation.net` are not downloads. They are the object CDN a web page loads cover art from, and direct access to them times out.

The suffix is replaced by the endpoints that actually carry game content: `DOMAIN-SUFFIX,ww.prod.dl.playstation.net` covers the `gs2` family, and `zeus` and `ares` are named exactly. Everything else under the parent falls through to `game-platform` with the rest of PSN's web surface. `gs2.ww.prod.dl.playstation.net` answers from `111.172.236.x`, a China Telecom address, so the mainland download path is preserved.

`psnine.com` itself is added to `china-web`. It is APNIC-confirmed mainland at `183.134.11.39` and was reaching the proxy fallback.

### Honkai: Star Rail

The game reported proxy use. Its dispatch and login domains reached `🎮 游戏平台` while the game server, which dispatch hands out as a bare address, fell to the fallback — two exits for one session, and the exit the account logged in from did not match the one the session arrived on.

`starrails.com` was the larger half of the split: the whole suffix sat in `game-download`, so the dispatch call took the download policy while the server connection took another. `autopatchos.starrails.com` is the client download and stays there; the rest of the domain joins the platform policy. `IP-CIDR,8.209.192.0/18,no-resolve` covers the gateway pool, which RDAP places in Alibaba Cloud Japan where the Asia servers rotate.

A `/32` on the observed address would have gone stale the first time the pool moved, and that failure is not a slow route — it is the detection firing again. Under fake-ip the breadth costs less than it reads: `no-resolve` means the rule only ever sees connections made to a bare address, because anything resolved through a domain carries a `198.18.0.0/16` destination instead. Dispatch-assigned game servers are exactly that case.

Verified end to end: dispatch for Asia, USA and Europe, the global dispatch, the login SDK, static resources, the account API, the website, the observed gateway and another address in the same block all reach `🎮 游戏平台`, while the client download stays on `🎮 游戏下载`.

First-match coverage is unchanged at 54 / 13 / 41 across all three.

## ER-060 — The same routing, in ten policy groups

**Type:** product shape; a second build, no rule changes

Forty-two policy groups exist so that each kind of traffic can be pointed at its own node. For anyone who does not want that, the same design is a screen of dropdowns to work through before the profile is usable. This publishes a second build that folds them, and publishes it as a build rather than a variant: the rules are the same file, the segments are the same 64, and only the target a segment names changes.

| | Full | Lite |
|---|---|---|
| Policy groups | 42 | 10 |
| Routing segments | 64 | 64 |
| Segments retargeted | — | 47 |

The ten kept are `♻️ 手动切换`, `🌏 国内网站`, `🎬 流媒体`, `🧲 海外 AI`, `🎮 游戏平台`, `🎮 游戏下载`, `🚀 国外服务`, `🛑 广告拦截`, `🔞 NSFW` and `🐟 漏网之鱼`. They were not chosen by count. A group survives folding when someone plausibly wants to point it somewhere different from everything else around it: mainland and overseas are the first split, downloads are metered differently from play, AI is the one overseas category people routinely give a separate node, and the two REJECT groups are decisions rather than destinations.

### The claim that had to be proved

Folding groups is only safe if it changes nothing about what traffic does, and that is a claim about every segment, not about the ones that were inspected. `Segment.lite_target` and `target_for(product)` make the fold a per-segment retarget rather than an edit, and `LiteProductTests` then compares the effective action of all 64 segments across both products: a target is followed to its group's leading member, and a group leading with `DIRECT` or `REJECT` counts as that, anything else as a proxy. Both products give 17 `DIRECT`, 45 `PROXY`, 2 `REJECT`.

A test that compares two things that cannot differ proves nothing, so it was checked against an injected fault: retargeting `游戏下载` to `国外服务` — a fold that looks reasonable and is wrong, because a metered download would start spending proxy bandwidth — fails it.

### What it costs

Granularity, and only granularity. In the full build Netflix can move to another node without touching YouTube; in the lite build they share `🎬 流媒体` and move together. That is the trade, and it is stated in both READMEs next to the number rather than buried.

Generation loops over both products throughout: `PRODUCT_CONFIG_NAMES` and `PRODUCT_TEMPLATE_NAMES` give `ekko-rules-lite.ini` and `reversed-template-lite.yaml` beside the originals, `validate_generated` checks the pair, and the self-host sync rewrites both. The converter lists the full build first and the lite build second, ahead of the third-party presets.

## ER-061 — The gateway pool was never in Japan; a sub-block was mistaken for the whole

**Type:** routing correctness; 1 rule widened to its registered allocation, 1 admin host added

### Honkai: Star Rail login still failed

ER-059 admitted `IP-CIDR,8.209.192.0/18,no-resolve` after observing a gateway at `8.209.197.93`. The game kept rejecting login with `1001_1` — the error that asks the player to turn off their proxy. A router log caught the connection at the moment it happens:

```
[UDP] 192.168.6.224:64817 --> 8.216.16.211:23301  match Match using 🐟 漏网之鱼
```

Port 23301 is the HoYoverse gateway. `8.216.16.211` is outside the `/18`, so it fell to the fallback while the login session used another exit, and the risk check saw one account arriving from two places.

RDAP explains the miss:

| Address | Registered allocation | Holder |
|---|---|---|
| `8.209.197.93` | `8.209.192.0/18` ALICLOUD-JP | Alibaba Cloud, Tokyo |
| `8.216.16.211` | `8.208.0.0/12` ASEPL-SG | Alibaba Cloud (Singapore) |

`8.209.192.0/18` is a Japanese sub-block carved out of `8.208.0.0/12`. The earlier rule took that sub-block for the whole pool: one observed Japanese gateway was read as "the pool is in Japan", when the pool spans Alibaba Cloud's international estate and hands out a Singapore address just as readily.

The rule is now `IP-CIDR,8.208.0.0/12,no-resolve` — the exact boundary of the ASEPL-SG allocation, not a range invented to be wide enough. Edges verified: `8.208.0.1` and `8.223.255.254` match; `8.207.255.255` and `8.224.0.1` still fall through.

The breadth costs less than it reads. `no-resolve` under fake-ip means the rule only ever sees connections made to a bare address, because anything resolved through a domain carries a `198.18.0.0/16` destination instead. What moves is bare-IP traffic to Alibaba Cloud international, from `🐟 漏网之鱼` to `🎮 游戏平台` — and both default to `♻️ 手动切换`, so the default action does not change at all. What changes is that the game can be pointed at one region without moving everything else.

### The Tailscale console has a second host

`console.tailscale.com` answers from CloudFront, while `login.tailscale.com` and `controlplane.tailscale.com` sit in Tailscale's own `192.200.0.0` space — relays are not served from a CDN, consoles are. Direct access to it from the mainland times out, which is the reason it needs a policy that can reach. It joins `🖥️ 远程串流后台` as an exact `DOMAIN`, which cannot touch a relay: `derp1a`, `controlplane`, `ts.net` and `log.tailscale.io` were re-verified on the data policy in both builds.

### Recorded but not acted on

The same log shows ZeroTier's data plane on the fallback:

```
[UDP] 192.168.6.224:9993 --> 84.17.53.155:9993  match Match using 🐟 漏网之鱼
```

`84.17.53.155` is Datacamp Zurich, where `root-zrh-01.zerotier.com` lives. The `DOMAIN` rule for that host can never fire: the client caches root addresses and sends UDP straight to them without a lookup, and `PROCESS-NAME` cannot help on a router, where forwarded LAN traffic carries no process. So on a router ZeroTier's data plane always reaches the fallback.

It is not fixed here, for two reasons. Its registered block `84.17.52.0/23` belongs to Datacamp, a CDN, so using it as a stand-in for ZeroTier would capture unrelated traffic. And direct access to a Zurich root from the mainland is not established to work, while the proxy path currently does — moving it to DIRECT on reasoning alone is the mistake ER-058 was written about. It needs a measurement first.

## ER-062 — A cached "latest" told visitors they were current when they were not

**Type:** correction; the version check stops caching and stops using the REST API

`selfhost-v0.2.1` was published and the deployed page kept reading:

```
规则 0.2.0 · 最新 0.2.0
```

The health endpoint agreed: `latest_ekko_rules_version: "0.2.0"`, `update_available: false`. Nothing had failed. The answer was half an hour old, because ER-059's check cached for thirty minutes while the update timer pulls every five.

That is not a tuning miss, it is the feature inverted. The check exists because a visitor could not otherwise tell whether a deployment had caught up; a stale cache does not merely withhold that — it states the opposite, with the same confidence as a correct answer. And once the image moved before the check did, the page would print a running version newer than the "latest" beside it, which reads as a bug to anyone who sees it.

### Why it cached at all

Because of where it was asking. Anonymous `api.github.com` allows 60 requests an hour per address, and this server makes the call for every visitor, so a lookup per page load would stop working for everybody the moment the site saw sixty visits in an hour. The cache was protecting the quota, and the quota was dictating the freshness.

The quota is avoidable. Tags now come from git's ref advertisement — `https://github.com/<repo>.git/info/refs?service=git-upload-pack`, what `git ls-remote` reads — which is not metered that way. It is about 6 KB, less than the page it appears on. With the quota gone there is no reason left to cache, so the check now runs on every load and the displayed answer is as old as the request that produced it.

What remains is a failure backoff. When the lookup is failing, asking again on every load would make each visitor wait out the timeout for an answer that is not coming, so a failure is held for a minute and the last known value is served meanwhile. Concurrent callers still share one request, so several people opening the page at once make one lookup rather than several.

### The contradiction cannot be printed any more

The running image was built from a published tag, so the newest published version is at least the one running here. If the check ever lags behind the image again, the health endpoint reports the running version as the latest rather than a smaller number, because a smaller number is both wrong and alarming.

The star count keeps its own thirty-minute clock on the REST API. It does not need to be fresh, and leaving it there keeps the quota untouched for it.

### Parsing

`parseRefTagNames` scans for ref names rather than parsing the pkt-line framing: a name ends at the first character git forbids in one, which is the NUL or newline the framing puts there, or the caret of a peeled `^{}` entry. Tested against a body shaped like the real thing — pkt-line lengths, a NUL-delimited capability list on the first ref, peeled entries, and refs that are not tags — and against a body with no tags at all, which must yield nothing rather than a guess.

## ER-063 — Money has its own exit requirement

**Type:** product shape; 1 group and 1 segment added, funded by consolidation; 8 mainland banks admitted

`wise.com` reached `🐟 漏网之鱼`. It worked, which is why it went unnoticed: the fallback is a proxy, so the page loaded. What it did not have was an exit of its own. A financial account is checked against where it is used — a login from an exit that does not match the account's history is what triggers verification, and in the worst case a freeze. Sharing an exit with every unclassified request means that exit changes whenever anything else does. That is the same defect as the game: one session, an exit it did not choose.

`💳 金融服务` defaults to `♻️ 手动切换` and holds 44 rules across four families:

| Family | Holds |
|---|---|
| Payments and remittance | Wise, PayPal, Payoneer, Revolut, Remitly, Western Union, Xoom, Airwallex, dLocal |
| Virtual cards | WildCard, Dupay, Privacy.com |
| SMS receipt and virtual numbers | SMS-Activate, 5SIM, SMSPVA, SMS-Man, OnlineSIM, SMSPool, Receive-SMS, JuicySMS, TextNow |
| Overseas banks and brokers | HSBC (incl. `.com.hk`), Citi, Chase, Bank of America, Wells Fargo, DBS, OCBC, UOB, Standard Chartered, Barclays, Santander, Schwab, Fidelity, Interactive Brokers, Futu, moomoo, Tiger |

Virtual cards and SMS receipt belong here rather than anywhere else because they are the step where an account is created: the address that registers a number or a card is the address the account is thereafter expected to arrive from. Every domain was resolved before admission; the ones that did not answer are not in the list.

`futunn.com` and `moomoo.com` resolve into Hong Kong ranges, not mainland ones, so they are foreign services here rather than DIRECT candidates — checked rather than assumed, because a broker on Tencent Cloud reads like a mainland service at a glance.

### Funding

The product was at the 64-segment ceiling, so the segment is paid for the way ER-023 established. `kakao-talk` is concatenated into `line`: the two were adjacent with nothing between them and both target `📲 聊天软件`, so appending one to the other cannot reorder anything and cannot change where any rule lands. Verified after the merge — `kakao.com`, `daum.net`, `kakaocdn.net`, `potplayer.tv`, `line.me`, `lin.ee` and `linecorp.com` all still reach the same policy in both builds. The retired Raw URL survives as a generated-only compatibility copy of the `[36, 51)` slice behind frozen list and provider hashes.

### Eight mainland banks were on the fallback

Checking that mainland banks stayed DIRECT turned up twelve that did not. A mainland bank reaching the fallback is worse than a foreign one: the proxy exit is exactly what its risk check objects to.

The mainland probe answered for each. Eight resolve wholly into APNIC's CN ranges and are admitted to `china-web`: 兴业、华夏、民生、北京、上海、南京、浙商 and 广发. Four are not: `cloudpay.com.cn` and `yunshanfu.cn` resolve outside those ranges, and `gdb.com.cn` and `hsbank.cc` do not resolve at all. They stay on the fallback. A bank being obviously Chinese is a reason to look, not a verdict — the seed list is not the evidence, and the four without a verdict are not admitted on the strength of their names.

Verdicts join `docs/evidence/cn-apnic-verdicts-2026-09-19.json` under the probe round
`bank-2026-09-19` rather than opening a fourth evidence route. It is the same method,
the same registry and the same verdict type, and ER-057 already established that an
evidence category holding one round of one thing is scaffolding rather than a route.

