<div align="center">

<img src="selfhost/app/src/app/icon.png" width="88" alt="Ekko Rules">

# Ekko Rules

**Turn an airport subscription into one configuration you can import as-is**

Nodes · DNS · policy groups · routing rules, all in a single file

[![License](https://img.shields.io/github/license/ZaunEkko/ekko-rules?style=flat-square&color=1b1be0)](LICENSE)
[![Validate](https://img.shields.io/github/actions/workflow/status/ZaunEkko/ekko-rules/validate.yml?branch=main&style=flat-square&label=validate)](https://github.com/ZaunEkko/ekko-rules/actions/workflows/validate.yml)
[![Clients](https://img.shields.io/badge/clients-9-1b1be0?style=flat-square)](#three-steps)
[![Shadowrocket](https://img.shields.io/badge/Shadowrocket-device_verified-1b1be0?style=flat-square)](#run-it-yourself)
[![Stored](https://img.shields.io/badge/stored-nothing-1b1be0?style=flat-square)](#three-steps)

**[Convert online](https://sub.boxnook.cc)** · [Self-host](#run-it-yourself) · [Rules](#key-routing-groups) · [中文](README.md)

<!-- DEMO: record the walkthrough once sub.boxnook.cc is live and place it here -->

</div>

---

## Three steps

<!-- DEMO: record the walkthrough once sub.boxnook.cc is live -->

**1.** Open **[sub.boxnook.cc](https://sub.boxnook.cc)**
**2.** Paste your subscription URL (the field is masked by default)
**3.** Press "one-tap import" — the button follows whichever client you picked

Done. Flip UDP, XUDP and the rest under advanced options if you need them — the link rewrites itself as you go. Copying the link or scanning it with a phone works too. Shadowrocket is the exception: the page presents two ordered actions and two QR codes, **1. node subscription** and **2. routing config**. Import both in that order. The first is added from Home and owns refreshes, the profile name, and traffic/expiry banner; the second is added from Configuration and owns rules, groups, the manual selector, and `DIRECT` / `REJECT`.

**The site stores nothing.** No accounts and no profile list; the subscription body is held in memory for the conversion and deleted straight after, and no log records the address. The trade-off is that **the link carries your subscription credential** — import it into your own client, do not forward it.

Rules default to this repository's Ekko Rules. The page can also switch to the common ACL4SSR sets, or take a remote configuration URL of your own.

## Two reasons a conversion comes back empty

**The provider blocked the converter.** A public converter fetches your
subscription from its own server, so the provider sees an unfamiliar IP. Some
refuse it outright; others only answer a specific client User-Agent. Try these
in order of effort:

1. Set a custom User-Agent under "advanced options" — often that is all the
   provider checks.
2. **Run it on your own computer** (the next section). The fetch then comes
   from your home connection, the address the provider already sees from you.
   Deploying to a VPS is not the same thing: that is still a datacenter IP and
   can be blocked for the same reason.

**The subscription is switched off in the provider's panel.** Plenty of
providers keep it disabled by default, and changing plan or resetting the link
disables it again. The URL still resolves, but what comes back is empty. Check
that the subscription is enabled and that you copied the current link; reset it
if in doubt.

## Client switches that rewrite the profile

What you import is a complete configuration — nodes, DNS, proxy groups and
routing rules — and the parts depend on each other. The rules are only accurate
because the DNS and the groups that ship with them are in place.

Most clients offer switches that **replace** part of that with the client's own:

| Switch | What it replaces |
|---|---|
| DNS override / DNS settings | the whole `dns:` section — split resolution, fake-ip, encrypted upstreams |
| Smart core / smart groups | how the proxy groups are typed and select nodes |
| Global merge / script | any part of the profile |

**If you are not sure what they do, leave them off.** This side is already
handled. Take it over only if you know exactly what you are changing.

## Run it yourself

Rather not involve anyone else? The same code in its other shape: the real subscription goes only to your own Docker, **never appearing in a URL at all**, and you get a stable local address that your client keeps refreshing.

```bash
git clone https://github.com/ZaunEkko/ekko-rules.git
cd ekko-rules/selfhost
docker compose up --build -d
```

Open [http://127.0.0.1:8787](http://127.0.0.1:8787) to create one, and you get `http://127.0.0.1:8787/sub/<random id>`. Phones, tablets, and routers on the same LAN use the computer's IP instead.

On Windows, `setup.cmd` additionally installs a login-time helper that tracks the machine's LAN address, so the page follows along after a Wi-Fi change. Full instructions, security boundaries, and troubleshooting live in [`selfhost/README.md`](selfhost/README.md).

| | Hosted site | Self-hosted |
|---|---|---|
| Who fetches your subscription | The site's server, discarded immediately | Your own Docker |
| Subscription inside the URL | Yes — so do not forward the link | No |
| Stable address | The link carries every option | `/sub/<random id>` |
| What you install | Nothing | Docker + Compose v2 |

Both shapes emit nine client formats: Clash / Mihomo, Shadowrocket, sing-box, Surge 4+, Loon, Quantumult X, Surfboard, Quantumult, and Mellow. Mihomo and sing-box are verified to retain AnyTLS, VLESS Reality, Hysteria2, and TUIC; the others carry whatever their client actually supports. Shadowrocket has been verified on a real device, but treats its node subscription and native configuration as two independent objects, so the page deliberately provides an ordered two-step import. The Home `.yaml` owns the correct name, node refreshes, and traffic/expiry banner; the Configuration `.conf` owns rules, the manual selector, `DIRECT` / `REJECT`, nested groups, and default choices. Both are required. Built-in full and lite rules, ACL4SSR and other third-party presets, and allowed custom remote configs share this conversion path. Advanced options cover emoji, UDP, TFO, TLS 1.3, XUDP, sing-box IPv6, node filtering/sorting/renaming, a custom User-Agent, and the update interval. When the upstream returns `Subscription-Userinfo`, traffic, quota, and expiry fields are passed through safely.


## Rules only, no conversion

### Native Mihomo template

```text
https://raw.githubusercontent.com/ZaunEkko/ekko-rules/main/generated/reversed-profile/Mihomo/reversed-template.yaml
```

The lite build has one too:

```text
https://raw.githubusercontent.com/ZaunEkko/ekko-rules/main/generated/reversed-profile/Mihomo/reversed-template-lite.yaml
```

Download it, replace `PUT_YOUR_SUBSCRIPTION_URL_HERE` with your own subscription URL, and load it in Clash Verge Rev or another Mihomo client. The template supplies proxy providers, policy groups, rule providers, and rules only; it does not take over ports, DNS, TUN, the controller, or other client settings.

### With another Subconverter frontend

The rules are public, so they also work in any Subconverter frontend that accepts a custom remote configuration: set the output to `Clash` and the remote configuration to one of these two.

Full build, 44 policy groups:

```text
https://raw.githubusercontent.com/ZaunEkko/ekko-rules/main/generated/reversed-profile/config/ekko-rules.ini
```

Lite build, 10 policy groups, routing identical to the full one:

```text
https://raw.githubusercontent.com/ZaunEkko/ekko-rules/main/generated/reversed-profile/config/ekko-rules-lite.ini
```

> **A conversion backend sees the complete subscription URL, token included.** That is inherent to online conversion: the backend must have the full address to fetch the nodes. Ekko Rules only publishes rules; it never receives and cannot see what anyone submits elsewhere, and self-hosting only the frontend while still calling a public backend hides nothing. If that matters to you, use one of the two shapes above. Never paste a tokenized subscription URL into an issue, a PR, a log, or a public chat.

## Key routing groups

Ekko Rules focuses on traffic that commonly needs a dedicated node or region:

- **Ad blocking**: `🛑 广告拦截` uses pinned anchored domain rules and defaults to `REJECT`, while remaining manually switchable to a node or `DIRECT`;
- **AI and design tools**: separate OpenAI and Claude groups; Gemini, Grok, Microsoft AI, Cursor, Hugging Face, Perplexity, Poe, OpenRouter, Mistral, Groq, Figma, and international Kimi, Z.ai, Qwen, and MiniMax sites use `🧲 海外 AI`; DeepSeek, Xiaohongshu, and mainland Chinese AI services such as Seko, Kling, Vidu, Jimeng, Hailuo, LiblibAI, RunningHub, Tusi, MOKI, and Chanjing use the default-direct `🌏 国内网站` group;
- **Major streaming**: YouTube, Netflix, Disney+, Apple TV+, `🎬 HBO GO/MAX`, Prime Video, DAZN, and TikTok are handled separately; HBO GO and Max share one group, while DAZN remains independent;
- **Regional media**: US long-tail services use `🎬 美国流媒体`, with separate handling for HMT, Bilibili HMT, Southeast Asia, Japan, Korea, iQIYI, and mainland Chinese media; verified third-party mainland video APIs and their dedicated playback hosts use the default-direct `🌏 国内流媒体` group so high-volume playback does not fall through to the proxy fallback;
- **Gaming**: mainland Chinese launchers, login, community, and voice services use the default-DIRECT `🌏 国内网站` group; dedicated download endpoints use default-DIRECT `🎮 游戏下载`; `🎮 游戏平台` is reserved for overseas platforms and defaults to `♻️ 手动切换`;
- **Social and communication**: separate groups for social media, messaging, Discord, and email;
- **Remote streaming and real-time communication**: split into two groups. `🖥️ 远程串流流量` defaults to `DIRECT` and carries the data plane — Tailscale's DERP relays and control plane, ZeroTier root servers, Parsec and RustDesk session endpoints, NetBird signalling and relay, Chrome Remote Desktop, plus mainland ToDesk, Sunlogin, RayLink and mainstream RTC/IM foundations — so remote desktop, voice and real-time traffic never traverses a proxy unnecessarily. `🖥️ 远程串流后台` defaults to `♻️ 手动切换` and holds only the vendors' admin consoles and websites (Tailscale, ZeroTier, NetBird, Parsec, RustDesk, AnyDesk, TeamViewer, Moonlight). They are separate because one vendor suffix covers two jobs at once: the console cannot be reached from the mainland on a direct path, while the relays beneath that same suffix carry the streaming payload — either policy applied alone is wrong for half the traffic;
- **Mainland foundations**: CAPTCHA, push delivery, domestic code and model communities, collaborative documents, electronic certification, mainstream learning platforms, and clearly mainland smart-device or connected-car entry points reuse the default-direct `🌏 国内网站`; only official roots are included, without broadly directing globally shared device clouds;
- **Developer services**: `🧑‍💻 开发服务` lists `♻️ 手动切换` first and now covers Linear, Notion, Slack, Atlassian, Postman, Sentry, Vercel, Supabase, mainstream CI/CD and observability platforms, developer databases, and online IDEs in addition to source hosting and language-package ecosystems; switch it temporarily to `DIRECT` when proxy traffic matters; generic CDNs, object storage, and user-hosted sites remain excluded;
- **Adobe**: `🎨 Adobe` lists `♻️ 手动切换` first and covers official Creative Cloud, Acrobat, Behance, Adobe Stock, and Typekit services, allowing a compatible non-Hong-Kong exit to be pinned independently; the lite build folds it into `🚀 国外服务`;
- **Cloud infrastructure**: `☁️ 国内云服务` defaults to `DIRECT` for domestic cloud websites, consoles, APIs, object storage, and CDNs; `☁️ 海外云服务` defaults to `♻️ 手动切换` for global AWS, Azure, Google Cloud, Cloudflare, DigitalOcean, Vultr, Linode/Akamai, Oracle Cloud, and overseas regional endpoints from mainland cloud vendors; advertising and concrete business rules remain earlier;
- **Overseas shopping**: `🛒 海外购物` defaults to `♻️ 手动切换` and covers the regional Amazon storefronts, eBay and Etsy, Japanese shops such as DLsite, Rakuten, ZOZO, Suruga-ya, Mandarake and AmiAmi, forwarding services such as Buyee, ZenMarket and tenso, and regional retailers such as Gmarket, SSG and Takealot. What these sites show, what they will sell you and whether they challenge you at all depends on which exit reaches them, so a separate group lets you pick a node for shopping alone. Anything already classified elsewhere stays there: Alibaba's Lazada and Shopee mainland entries remain direct, Coupang remains under `🎬 韩国媒体`, and `aws.amazon.com` and the Prime Video image CDN keep their cloud and streaming policies;
- **Finance and account registration**: `💳 金融服务` defaults to `♻️ 手动切换` and covers payments and remittance (Wise, PayPal, Payoneer, Revolut, Remitly, Western Union), virtual cards (WildCard, Dupay, Privacy.com), SMS receipt and virtual numbers (SMS-Activate, 5SIM, SMSPVA, OnlineSIM, TextNow), and overseas banks and brokers (HSBC, Citi, Chase, Bank of America, Wells Fargo, DBS, OCBC, UOB, Standard Chartered, Barclays, Schwab, Fidelity, Interactive Brokers, Futu, moomoo, Tiger). A financial account is checked against where it is used, and an exit that does not match its history triggers verification or a freeze; virtual cards and SMS receipt sit in the same group because the address that registers a card or a number is the address the account is thereafter expected to arrive from. Mainland banks are not here — they stay on the default-direct `🌏 国内网站`;
- **Other important traffic**: music, cloud storage, Microsoft, Apple, Google, and mainland Chinese sites have dedicated groups; `🔞 NSFW` defaults to `REJECT` while remaining manually switchable to a node or `DIRECT`;
- **Fallback**: unmatched traffic reaches `🐟 漏网之鱼`.

All groups remain manually switchable and automatic latency testing is disabled; `🛑 广告拦截` and `🔞 NSFW` default to `REJECT`. If blocking affects login, playback, purchases, notifications, or telemetry in a particular app, temporarily switch `🛑 广告拦截` to `DIRECT` or another policy.

## Lite build: same routing, 10 policy groups

Forty-four groups exist so that each kind of traffic can be pointed at its own node. If you do not need that, what you get instead is a screen of dropdowns to work through. The lite build folds them together:

| | Full | Lite |
|---|---|---|
| Policy groups | 44 | 10 |
| Routing segments | 57 | 57, unchanged |

The ten that remain are `♻️ 手动切换`, `🌏 国内网站`, `🎬 流媒体`, `🧲 海外 AI`, `🎮 游戏平台`, `🎮 游戏下载`, `🚀 国外服务`, `🛑 广告拦截`, `🔞 NSFW`, and `🐟 漏网之鱼`.

**Behaviour does not change.** Folding removes no rules; it retargets the full build's fine-grained policies onto merged groups. The ones that each had a group of their own and all defaulted to a proxy — OpenAI, Claude, Adobe, the individual streaming services, social, developer services, overseas cloud, overseas shopping — go to `🚀 国外服务` or `🎬 流媒体`; the mainland groups that defaulted to direct go to `🌏 国内网站`. Every rule still has the same effective action and match order; tests compare the two products segment by segment.

**What it costs is granularity.** In the full build you can move Netflix to another node without touching YouTube; in the lite build they share `🎬 流媒体`, so they move together. If you need to pick routes per service, use the full build.

In the converter's remote-configuration dropdown, the full build is first and the lite build second. The URLs for using the rules alone are in the previous section.

## Mainland domains, IPs, and DNS

The terminal routing order is fixed as:

```text
all concrete business rules
→ five non-Microsoft late-recovery rulesets
→ overseas cloud → domestic cloud
→ Microsoft and its late recovery → Google
→ overseas shopping
→ broad mainland roots
→ GEOIP,CN,DIRECT,no-resolve
→ MATCH,🐟 漏网之鱼
```

The second-to-last layer is nine broad mainland roots — the apexes of Baidu, Tencent, NetEase and Xiaomi, plus the `gtimg.com` and `127.net` CDN roots. They sit here rather than earlier because ordering is semantics: specific cloud, media and AI hosts live beneath those same roots, and matching the root first would take them. Like the rest of the mainland layer they come from this repository's own evidence (see [`docs/PROVENANCE.md`](docs/PROVENANCE.md)), use only anchored `DOMAIN` / `DOMAIN-SUFFIX` entries, and use no deprecated `GEOSITE`, `DOMAIN-KEYWORD`, regular expression, or single-label/public-suffix catchall. Matches go to `🌏 国内网站`, whose default action is `DIRECT`, without an extra DNS lookup. The much larger mainland domain layer of 4,266 rules sits earlier, among the specific service rules.

The terminal `GEOIP,CN,DIRECT,no-resolve` rule supplements this with mainland destination-IP classification. `no-resolve` prevents that matcher from initiating a DNS lookup for a domain; if the client already knows the destination IP, GEOIP can still evaluate it. A domain not covered by the classic layer, with no destination IP available at matching time, continues to `🐟 漏网之鱼`. Ekko Rules keeps `no-resolve` on every destination-IP rule and publishes no actively resolving variant.

## Routing safety

- every destination-IP rule carries `no-resolve`;
- broad `DOMAIN-KEYWORD` rules are forbidden under default-direct policies;
- the mainland-domain layer contains only anchored `DOMAIN` / `DOMAIN-SUFFIX` entries and sits after late recovery but before China GEOIP and FINAL;
- unmatched traffic reaches `🐟 漏网之鱼`.

## Feedback and rule proposals

Use the structured issue forms:

- [➕ Domain or service rule proposal](https://github.com/ZaunEkko/ekko-rules/issues/new?template=domain-addition.yml)
- [🧭 Policy-group or mapping change](https://github.com/ZaunEkko/ekko-rules/issues/new?template=policy-group-change.yml)
- [🐛 Misclassification or rule problem](https://github.com/ZaunEkko/ekko-rules/issues/new?template=routing-problem.yml)

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`SUPPORT.md`](SUPPORT.md) first. You can also ask your coding agent to read the contribution guide and prepare the issue:

```text
Read https://github.com/ZaunEkko/ekko-rules/blob/main/CONTRIBUTING.md,
then prepare an issue using the repository's issue form. Use only public domains and public evidence.
Do not read or submit subscription URLs, tokens, node addresses/ports, passwords, UUIDs,
private keys, or complete client configurations. Show me the final issue body before submitting it.
```

If credentials were already exposed, revoke or rotate them immediately; editing or deleting an issue does not make them safe again.

## Project boundary

Ekko Rules has the following responsibility boundary:

- public rules and online remote configurations store no proxy nodes or subscription credentials; the self-hosted `lan` shape stores only the minimum stable-URL mapping in the user's own Docker volume; the `public` shape stores no subscription, node, or per-person record at all, only two running pairs of integers;
- the public Mihomo template leaves ports, DNS, TUN, controller, and other settings to the client; the self-hosted entry point generates an import-ready complete configuration;
- the public rules product maintains rules, order, policy groups, and mappings; the self-hosted app only fetches subscriptions locally and invokes a pinned converter engine;
- `sources/` is the sole canonical source for the rules product, and `generated/reversed-profile/` is rebuilt only by the generator;
- `selfhost/` contains the web app, converter snapshot, and Docker Compose stack in two shapes: `lan` stores fixed profiles and serves only whoever deployed it, `public` stores nothing and serves everyone. There is no third shape that keeps other people's subscriptions on a public server.

## Development and validation

Python 3.12 is required:

```bash
python -m pip install -r requirements.txt
python scripts/generate_profile.py
python scripts/validate_generated.py
python scripts/generate_profile.py --check
python -m unittest discover -s tests -v
```

Generation uses same-volume staging and atomic replacement. Validation covers the closed generated file set, order, one FINAL, providers, SHA-256, sensitive content, strict CIDRs, `no-resolve`, anchored DIRECT-default rules, and the Phase 2/3 migration and recovery ledgers.

## License and notices

Ekko Rules is licensed under the [MIT License](LICENSE). See [`NOTICE.md`](NOTICE.md) and [`docs/PROVENANCE.md`](docs/PROVENANCE.md) for source-overlap facts, trademarks, and disclaimers.
