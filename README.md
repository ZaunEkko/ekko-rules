# Ekko Rules

[English](README_EN.md)

面向 Subconverter 与 Mihomo 的可复用分流规则和订阅模板。

## 项目定位

Ekko Rules 采用与 ACL4SSR 在线预设相同的职责边界：不保存节点或订阅凭据，不接管 `proxies` 上方的端口、DNS、TUN 和控制器设置，只维护策略组、规则集、顺序和策略映射。`sources/` 是唯一规范源，`generated/reversed-profile/` 只能由生成器重建。

## Core 与 Extended

| 产品 | Rulesets / Segments / Groups | 内容 | Base |
|---|---:|---|---:|
| Core | 59 / 60 / 37 | 默认 AI、娱乐、NSFW、通信、厂商及 DIRECT 兼容层 | 否 |
| Core Full | 59 / 60 / 37 | Core + 仓库脱敏基础配置 | 是 |
| Extended | 63 / 64 / 38 | Core + EMBY 社区、Spotify legacy、Qobuz 品牌防御 | 否 |

Subconverter：

- `config/ekko-rules.ini`：Core 在线预设；
- `config/ekko-rules-full.ini`：Core + base；
- `config/ekko-rules-local.ini`：本地 Core；
- `config/ekko-rules-extended.ini`：Extended 在线预设；
- `config/ekko-rules-extended-local.ini`：本地 Extended。

Mihomo：

- `Mihomo/reversed-template.yaml`：Core；
- `Mihomo/reversed-template-extended.yaml`：Extended。

## 三期特化与瘦身

- OpenAI、Claude、海外 AI 分开；海外 AI 包含 Google AI、xAI、Microsoft AI、Cursor、Hugging Face、Perplexity、Poe、OpenRouter、Mistral、Groq 等，不含国产 AI；
- Netflix、Disney+、YouTube、Max、HBO GO、Prime Video、Apple TV+、DAZN、TikTok 等重点娱乐服务继续独立；
- 美国长尾统一为 `🇺🇸 美国流媒体`，港澳台普通媒体统一，B站港澳台继续独立，B站东南亚升级为东南亚媒体；
- OneDrive 与 iCloud 共用 `☁️ 云盘服务`；Instagram 并入社交媒体，Bing 并入微软服务；
- 新增 `🔞 NSFW`，只收录 38 条高置信 `DOMAIN-SUFFIX`，不使用宽关键词、公共后缀或共享云/CDN 根域；
- `global-web`、`academic`、`yahoo`、`community-overrides`、`streaming-legacy` 整段删除，不迁入另一大桶，普通流量交给 `🐟 漏网之鱼`；
- Apple、Google、Microsoft、Netflix、global-media、game-platform、china-media、YouTube、B站港澳台、爱奇艺及日本/港澳台媒体按官方根域、专属 CDN、进程和明确自有 IP 重建；
- `china-web/GEOIP,CN` 之后、FINAL 之前保留六个 late recovery ruleset：只恢复 Phase 2 中原 DIRECT 默认优先、Phase 3 后会落入代理 FINAL 的首有效 matcher；原 proxy/manual-first 规则仍允许交给 FINAL，当前细分规则继续优先。

Core 含 4,250 条规则，Extended 含 4,348 条规则，均含唯一 FINAL。两者都有 206 条目标 IP 规则，全部带 `no-resolve`。三期 reduction Counter 保持历史闭合：旧 Extended 15,517 = 1,549 条共同规则 + 13,968 条删除；瘦身后的 Extended 1,615 = 1,549 条共同规则 + 66 条新增。随后 recovery 台账证明：3,472 条历史 DIRECT-default occurrence = 638 条已由 Phase 3 覆盖 + 2,834 条 residual；2,834 = 2,737 条首有效候选 + 97 条历史遮蔽/非 DIRECT owner 排除；实际输出 2,732 = 2,737 - 7 条不安全 `DOMAIN-KEYWORD` + 2 条经官方资料锚定的 Roblox 后缀。late recovery 禁止 `DOMAIN-KEYWORD`，仿冒品牌字符串域名继续进入 FINAL。恢复层用于兼容原默认路由，不声称每个历史域名或 IP 仍由原厂商独占。

二期历史证据保持不可变：旧 15,540 条文件规则 = 二期 Extended 15,517 + 23 条明确删除；二期 Extended = 二期 Core 15,411 + 106 条 optional。

## 生成与验证

要求 Python 3.12：

```bash
python -m pip install -r requirements.txt
python scripts/generate_profile.py
python scripts/generate_profile.py --check
python scripts/validate_generated.py
python -m unittest discover -s tests -v
```

生成器使用同盘 staging 和原子目录替换；失败保留旧输出。门禁检查 Core/Extended 顺序、唯一 FINAL、Provider、SHA-256、敏感信息、strict CIDR、`no-resolve`、迁移 Counter、recovery 闭合，以及历史 DIRECT-default matcher 不再落入代理 FINAL。

## 私有仓库与发布门禁

仓库保持 Private。外部客户端通常不能匿名读取 Private GitHub Raw。当前不授予统一再分发许可，也不会自动提交、推送、发布或改变可见性。公开前必须完成人工来源和许可证审查：[`NOTICE.md`](NOTICE.md)、[`docs/PROVENANCE.md`](docs/PROVENANCE.md)、[`docs/PUBLICATION-GATE.md`](docs/PUBLICATION-GATE.md)。

DNS/TUN 仍属于客户端职责；`no-resolve` 能避免目标 IP 规则为匹配域名而主动解析，但不能替代 DNS 劫持、加密 DNS 或 `strict-route`。
