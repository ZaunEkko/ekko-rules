# Ekko Rules

[中文](README.md)

Local subscription generation and specialized AI, entertainment, gaming, and NSFW routing for Mihomo, sing-box, and mainstream proxy clients. Run the complete converter on your own computer, or reuse the public rules with a third-party Subconverter or the native Mihomo template.

## Choose a setup

| Setup | Best for | Who fetches the real subscription | Result |
|---|---|---|---|
| **Local self-hosting (recommended)** | Keeping the subscription on your own computer and importing a complete configuration | Your Docker stack | Stable local URL that can be refreshed repeatedly |
| Third-party online conversion | No Docker available and you accept trusting the backend | Third-party backend | Third-party subscription URL |
| Native Mihomo template | You only need Ekko Rules and manage client settings yourself | Your Mihomo client | Provider template |

### Recommended: local complete subscriptions

Docker with Compose v2 is required. On Windows, use the one-time setup entry for the first deployment:

```bash
git clone https://github.com/ZaunEkko/ekko-rules.git
cd ekko-rules/selfhost

# Windows: start Compose and install the current-user LAN helper
setup.cmd

# macOS / Linux
sh ./start.sh
```

If you are already in the repository:

```bash
cd selfhost
setup.cmd
```

Run `setup.cmd` only once. The Web and converter services use `restart: unless-stopped`, so Docker Desktop can restore the containers on later sign-ins while the Windows logon task restores LAN-IP detection. The containers remain fully manageable in Docker Desktop. `start.cmd` starts only the current session, and `docker compose up --build -d` remains the standard path when no host helper should be installed.

Open [http://127.0.0.1:8787](http://127.0.0.1:8787), paste the real subscription, select a client, and create a local subscription. Import the generated URL once:

```text
http://127.0.0.1:8787/sub/<random ID>
```

Whenever Docker is running, refreshing that same URL fetches the upstream subscription again and generates a fresh configuration. Normal stops, restarts, and `docker compose down` preserve the URL; only `docker compose down -v` removes the profile volume.

The same stable profile can directly serve phones, tablets, and routers on a trusted LAN. Docker publishes the Web port on all host interfaces by default. After the first Windows `setup.cmd` run, a lightweight current-user helper automatically follows the computer's LAN IP across later sign-ins and network changes. Address controls live beside the saved profiles and can switch every displayed, copied, and QR-rendered URL among `localhost`, the detected address, a custom computer IP, and the eight most recently used origins. When detected-LAN mode is selected, a new IP is applied automatically while the `/sub/<random ID>` path remains unchanged. See [`selfhost/README.md`](selfhost/README.md#手机与路由器使用局域网订阅) for details.

| Capability | Current behavior |
|---|---|
| Complete configuration | Mihomo output includes nodes, ports, DNS, policy groups, and Ekko Rules |
| Output formats | Mihomo / Clash, sing-box, Surge 4+, Quantumult X, Loon, Surfboard, Quantumult, and Mellow |
| Modern protocols | AnyTLS, VLESS Reality, Hysteria2, and TUIC are verified for Mihomo and sing-box |
| Stable profile | Import on a computer, phone, or router; the profile path survives Docker restarts |
| Network switching | Detected-LAN mode follows a new IP automatically; `localhost`, current origin, custom prefix, and eight recent origins remain selectable |
| Mobile import | Mihomo / Clash can be opened from the system camera or scan the raw URL in-app; both QR codes are rendered locally |
| Advanced options | Emoji, UDP, TFO, TLS 1.3, VLESS/VMess XUDP, sing-box IPv6, filtering, sorting, renaming, custom User-Agent, and more |
| Updates | Automatic updates are off by default; enable a 1–168 hour interval or refresh manually |
| Usage metadata | Traffic, quota, and expiry are forwarded when upstream provides `Subscription-Userinfo` |

The real subscription URL is stored only in a local Docker volume and is not exposed in generated output. The converter-engine port is not published to the host. Treat the random ID in the fixed URL as a local access credential and do not share it publicly. See [`selfhost/README.md`](selfhost/README.md) for implementation details and security boundaries.

### Alternative: online Subconverter conversion

Open a Subconverter frontend that supports custom remote configurations:

| Frontend | Recommended use |
|---|---|
| [`https://sub.v1.mk/`](https://sub.v1.mk/) | **Recommended.** Supports newer protocols such as AnyTLS; prefer it when the subscription contains newer-protocol nodes. |
| [`https://acl4ssr-sub.github.io/`](https://acl4ssr-sub.github.io/) | A popular alternative with older protocol support; it may not convert AnyTLS and other newer protocols. |

Subscription conversion combines three separate parts:

| Part | Role and trust boundary |
|---|---|
| Conversion frontend | Provides the web form for the subscription URL, target format, and remote configuration, then submits the conversion request to a backend. |
| Conversion backend | Fetches the real subscription and the Ekko Rules remote configuration, then generates the result; **its operator can know the complete real subscription URL, including its token.** |
| Ekko Rules | Provides only public rules, order, policy groups, and mappings; it neither receives nor stores the subscription URL submitted to the conversion backend. |

Self-hosting only the frontend while continuing to call a public conversion backend does not hide the real subscription URL. Protecting it requires a trusted or self-hosted conversion backend as well.

Fill in the form as follows:

| Field | Value |
|---|---|
| Subscription URL | Your own provider or node subscription |
| Target | `Clash` |
| Remote config | The Ekko Rules Raw URL below |

```text
https://raw.githubusercontent.com/ZaunEkko/ekko-rules/main/generated/reversed-profile/config/ekko-rules.ini
```

<details>
<summary>Expand when the remote configuration is ignored or the generated URL contains <code>%20</code></summary>

After pasting the complete URL into the remote-configuration field, the dropdown shows a candidate containing that same full URL. **Click that URL candidate to select it**; pasting it or pressing Enter alone is not sufficient. A successful selection returns the field to read-only mode while displaying the full URL. Confirm that it no longer says "Default", then generate the subscription. **Do not rely only on whether the input field visibly contains a space; inspect the final generated custom subscription URL.** Some frontends insert a leading space while submitting the remote configuration. A correct result contains `config=https%3A%2F%2Fraw.githubusercontent.com%2FZaunEkko%2Fekko-rules%2F...%2Fekko-rules.ini`, with `https` immediately after `config=`. If it contains `config=%20https...`, `%20` is that leading space. Delete the remote configuration, paste it again, click the complete URL candidate, regenerate, and recheck until `%20` is gone. If `config=` is missing or still begins with `config=%20https...`, the converter may fail to load Ekko Rules and fall back to its default preset instead of the 40 policy groups.

</details>

> The conversion backend needs the complete subscription URL to fetch nodes and perform the conversion, so it is not an anonymous relay. Use a trusted backend or self-host the conversion backend. Never paste a token-bearing subscription URL into issues, pull requests, logs, or public chats.

### Rules only: native Mihomo template

Mihomo template URL:

```text
https://raw.githubusercontent.com/ZaunEkko/ekko-rules/main/generated/reversed-profile/Mihomo/reversed-template.yaml
```

Download the template and replace:

```text
PUT_YOUR_SUBSCRIPTION_URL_HERE
```

with your own subscription URL, then load it in a Mihomo client such as Clash Verge Rev. The template provides only the proxy provider, policy groups, rule providers, and rules. Ports, DNS, TUN, controller settings, and other client configuration remain client-owned.

## Key routing groups

Ekko Rules focuses on traffic that commonly needs a dedicated node or region:

- **Ad blocking**: `🛑 广告拦截` uses pinned anchored domain rules and defaults to `REJECT`, while remaining manually switchable to a node or `DIRECT`;
- **AI and design tools**: separate OpenAI and Claude groups; Gemini, Grok, Microsoft AI, Cursor, Hugging Face, Perplexity, Poe, OpenRouter, Mistral, Groq, Figma, and international Kimi, Z.ai, Qwen, and MiniMax sites use `🧲 海外 AI`; DeepSeek, Xiaohongshu, and mainland Chinese AI services such as Seko, Kling, Vidu, Jimeng, Hailuo, LiblibAI, RunningHub, Tusi, MOKI, and Chanjing use the default-direct `🌏 国内网站` group;
- **Major streaming**: YouTube, Netflix, Disney+, Apple TV+, `🎬 HBO GO/MAX`, Prime Video, DAZN, and TikTok are handled separately; HBO GO and Max share one group, while DAZN remains independent;
- **Regional media**: US long-tail services use `🎬 美国流媒体`, with separate handling for HMT, Bilibili HMT, Southeast Asia, Japan, Korea, iQIYI, and mainland Chinese media; verified third-party mainland video APIs and their dedicated playback hosts use the default-direct `🌏 国内流媒体` group so high-volume playback does not fall through to the proxy fallback;
- **Gaming**: mainland Chinese launchers, login, community, and voice services use the default-DIRECT `🌏 国内网站` group; dedicated download endpoints use default-DIRECT `🎮 游戏下载`; `🎮 游戏平台` is reserved for overseas platforms and defaults to `♻️ 手动切换`;
- **Social and communication**: separate groups for social media, messaging, Discord, and email;
- **Remote streaming and real-time communication**: `🖥️ 远程串流` defaults to `DIRECT` for remote-access paths such as Tailscale, ZeroTier, Moonlight, RustDesk, AnyDesk, and TeamViewer, plus mainland ToDesk, Sunlogin, RayLink, and mainstream RTC/IM foundations, preventing remote desktop, voice, or real-time traffic from unnecessarily traversing a proxy;
- **Mainland foundations**: CAPTCHA, push delivery, domestic code and model communities, collaborative documents, electronic certification, mainstream learning platforms, and clearly mainland smart-device or connected-car entry points reuse the default-direct `🌏 国内网站`; only official roots are included, without broadly directing globally shared device clouds;
- **Developer services**: `🧑‍💻 开发服务` lists `♻️ 手动切换` first and now covers Linear, Notion, Slack, Atlassian, Postman, Sentry, Vercel, Supabase, mainstream CI/CD and observability platforms, developer databases, and online IDEs in addition to source hosting and language-package ecosystems; switch it temporarily to `DIRECT` when proxy traffic matters; generic CDNs, object storage, and user-hosted sites remain excluded;
- **Cloud infrastructure**: `☁️ 国内云服务` defaults to `DIRECT` for domestic cloud websites, consoles, APIs, object storage, and CDNs; `☁️ 海外云服务` defaults to `♻️ 手动切换` for global AWS, Azure, Google Cloud, Cloudflare, DigitalOcean, Vultr, Linode/Akamai, Oracle Cloud, and overseas regional endpoints from mainland cloud vendors; advertising and concrete business rules remain earlier;
- **Other important traffic**: music, cloud storage, Microsoft, Apple, Google, and mainland Chinese sites have dedicated groups; `🔞 NSFW` defaults to `REJECT` while remaining manually switchable to a node or `DIRECT`;
- **Fallback**: unmatched traffic reaches `🐟 漏网之鱼`.

All groups remain manually switchable and automatic latency testing is disabled; `🛑 广告拦截` and `🔞 NSFW` default to `REJECT`. If blocking affects login, playback, purchases, notifications, or telemetry in a particular app, temporarily switch `🛑 广告拦截` to `DIRECT` or another policy.

## Mainland domains, IPs, and DNS

The terminal routing order is fixed as:

```text
all concrete business rules
→ five non-Microsoft late-recovery rulesets
→ overseas cloud → domestic cloud
→ Microsoft and its late recovery → Google
→ classic mainland-domain rules
→ GEOIP,CN,DIRECT,no-resolve
→ MATCH,🐟 漏网之鱼
```

The classic domain layer uses `DOMAIN` and `DOMAIN-SUFFIX` entries selected from a pinned source revision to cover common mainland services without an extra DNS lookup. It uses no deprecated `GEOSITE`, `DOMAIN-KEYWORD`, regular expression, or single-label/public-suffix catchall. Matches go to `🌏 国内网站`, whose default action is `DIRECT`.

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

- public rules and online remote configurations store no proxy nodes or subscription credentials; the self-hosted app stores only the minimum stable-URL mapping in the user's local Docker volume;
- the public Mihomo template leaves ports, DNS, TUN, controller, and other settings to the client; the self-hosted entry point generates an import-ready complete configuration;
- the public rules product maintains rules, order, policy groups, and mappings; the self-hosted app only fetches subscriptions locally and invokes a pinned converter engine;
- `sources/` is the sole canonical source for the rules product, and `generated/reversed-profile/` is rebuilt only by the generator;
- `selfhost/` contains the local web app, converter snapshot, and Docker Compose stack; it has no public-hosting mode.

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
