# Ekko Rules

[English](README_EN.md)

面向 Subconverter 与 Mihomo 的单一标准分流规则产品。

## 项目定位

Ekko Rules 采用与 ACL4SSR 在线预设相同的职责边界：不保存节点或订阅凭据，不接管 `proxies` 上方的端口、DNS、TUN、控制器等客户端设置，只维护策略组、规则集、顺序和策略映射。`sources/` 是唯一规范源，`generated/reversed-profile/` 只能由生成器重建。

## 唯一产品

当前只提供一套逻辑产品，两个入口共享同一套 59 个 ruleset：

- Subconverter：`generated/reversed-profile/config/ekko-rules.ini`；
- Mihomo：`generated/reversed-profile/Mihomo/reversed-template.yaml`。

不提供自动测速、Provider 健康探测、Full、local 或 Extended 变体，也不提供仓库托管的 Clash 基础配置。Subconverter 从动态订阅接收节点；Mihomo 模板中的 `PUT_YOUR_SUBSCRIPTION_URL_HERE` 必须由使用者替换。

当前实算结果：

| Rulesets | Segments | Groups | 含 FINAL 规则 | 目标 IP 规则 | 缺失 `no-resolve` |
|---:|---:|---:|---:|---:|---:|
| 59 | 60 | 37 | 4,247 | 206 | 0 |

## AI、娱乐与 NSFW 特化

- OpenAI、Claude、海外 AI 分开；海外 AI 包含 Google AI、xAI、Microsoft AI、Cursor、Hugging Face、Perplexity、Poe、OpenRouter、Mistral、Groq 等，不含国产 AI；
- Netflix、Disney+、YouTube、Max、HBO GO、Prime Video、Apple TV+、DAZN、TikTok 等重点娱乐服务继续独立；
- 美国长尾统一为 `🇺🇸 美国流媒体`，港澳台普通媒体统一，B站港澳台继续独立，B站东南亚归入东南亚媒体；
- OneDrive 与 iCloud 共用 `☁️ 云盘服务`；Instagram 并入社交媒体，Bing 并入微软服务；
- `🔞 NSFW` 只使用高置信锚定域名，不使用宽关键词、公共后缀或共享云/CDN 根域；
- 游戏平台与游戏下载保持分离，音乐服务统一使用 `🎵 音乐平台`；
- `global-web`、`academic`、`yahoo`、`community-overrides`、`streaming-legacy` 已删除，普通 proxy/manual-first 流量由 `🐟 漏网之鱼` 接管。

## 路由安全与兼容层

- 所有 `IP-CIDR`、`IP-CIDR6`、`IP-SUFFIX`、`IP-ASN`、`GEOIP` 等目标 IP 规则必须带 `no-resolve`；
- 所有 DIRECT-default 域名规则禁止 `DOMAIN-KEYWORD`，避免品牌字符串仿冒域名绕过代理 FINAL；
- 六个 late recovery ruleset 位于 `china-web/GEOIP,CN,no-resolve` 之后、唯一 FINAL 之前，只恢复 Phase 2 中原本 DIRECT-default、否则会落入代理 FINAL 的首有效 matcher；
- 原 proxy/manual-first 规则仍可交给 FINAL，当前细分规则与国内 GEOIP 继续优先；
- recovery 是历史默认路由兼容层，不声称每个历史域名或 IP 仍由对应厂商独占。

Phase 3 历史台账保持不可变：3,472 条历史 DIRECT-default occurrence = 638 条已覆盖 + 2,834 条 residual；2,834 = 2,737 条首有效候选 + 97 条历史遮蔽/非 DIRECT owner 排除；实际输出 2,732 = 2,737 - 7 条不安全 `DOMAIN-KEYWORD` + 2 条锚定 Roblox 后缀。

## 生成与验证

要求 Python 3.12：

```bash
python -m pip install -r requirements.txt
python scripts/generate_profile.py
python scripts/validate_generated.py
python scripts/generate_profile.py --check
python -m unittest discover -s tests -v
```

生成器使用同盘 staging 和原子目录替换；失败保留旧输出。门禁检查单产品闭合集合、顺序、唯一 FINAL、Provider、SHA-256、敏感信息、strict CIDR、`no-resolve`、DIRECT-default 锚定规则，以及 Phase 2/3 迁移与 recovery 台账。

## 发布与许可证

仓库采用 [MIT License](LICENSE)。来源、重合事实、商标和免责声明见 [`NOTICE.md`](NOTICE.md) 与 [`docs/PROVENANCE.md`](docs/PROVENANCE.md)。GitHub Raw 入口只有在仓库公开后才能被外部客户端匿名读取；可见性切换必须通过单独、明确的人工操作完成，任何脚本都不会自动发布仓库。

DNS/TUN 仍属于客户端职责；`no-resolve` 能避免目标 IP 规则为匹配域名而主动解析，但不能替代 DNS 劫持、加密 DNS 或 `strict-route`。
