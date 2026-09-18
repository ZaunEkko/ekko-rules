# Rule Changes

ER-001 through ER-010 use the audit date **2026-07-30**; ER-011 and ER-012 use **2026-07-31**; ER-013 uses **2026-08-01**; ER-014 and ER-015 use **2026-08-02**; ER-016 through ER-021 use **2026-08-03**; ER-022 and ER-023 use **2026-08-04**; ER-026 and ER-027 use **2026-08-10**; ER-028 and ER-029 use **2026-08-12**; ER-030 uses **2026-09-12**; ER-031 uses **2026-09-17**; ER-032 through ER-040 use **2026-09-19**.
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
