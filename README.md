# Ekko Rules

[English](README_EN.md)

面向 Subconverter 与 Mihomo 的 AI、娱乐、游戏与 NSFW 特化分流规则。

## 快速使用

### Subconverter 在线转换

打开支持自定义远程配置的 Subconverter 前端，例如：

```text
https://sub.v1.mk/
```

按以下方式填写：

| 项目 | 填写内容 |
|---|---|
| 订阅链接 | 你自己的机场或节点订阅地址 |
| 生成类型 | `Clash` |
| 远程配置 | 下方 Ekko Rules Raw 地址 |

```text
https://raw.githubusercontent.com/ZaunEkko/ekko-rules/main/generated/reversed-profile/config/ekko-rules.ini
```

在“远程配置”输入框中粘贴完整地址并按 Enter 选中，然后点击“生成订阅链接”。转换后端会把订阅中的节点与 Ekko Rules 的策略组和规则组合成完整 Clash 配置。

> 第三方转换后端通常能够看到你提交的原始订阅地址。请使用可信后端，或自行部署 Subconverter。不要在 Issue、PR、日志或公开聊天中粘贴带 token 的真实订阅链接。

### Mihomo 原生模板

Mihomo 模板地址：

```text
https://raw.githubusercontent.com/ZaunEkko/ekko-rules/main/generated/reversed-profile/Mihomo/reversed-template.yaml
```

下载模板后，将其中的：

```text
PUT_YOUR_SUBSCRIPTION_URL_HERE
```

替换为自己的订阅地址，再由 Clash Verge Rev 等 Mihomo 客户端加载。模板只提供代理 Provider、策略组、Rule Provider 和规则，不接管端口、DNS、TUN、控制器或其他客户端设置。

## 产品规模

Ekko Rules 只发布一套标准产品，Subconverter 与 Mihomo 共用同一套规范源：

| Rulesets | Segments | Groups | 含 FINAL 规则 | 目标 IP 规则 | 缺失 `no-resolve` |
|---:|---:|---:|---:|---:|---:|
| 59 | 60 | 37 | 4,247 | 206 | 0 |

不提供自动测速、Provider 健康探测、Full、local 或 Extended 变体，也不提供仓库托管的 Clash 基础配置。

## 规则定位

- OpenAI、Claude、海外 AI 分开；海外 AI 包含 Google AI、xAI、Microsoft AI、Cursor、Hugging Face、Perplexity、Poe、OpenRouter、Mistral、Groq 等，不含国产 AI；
- Netflix、Disney+、YouTube、Max、HBO GO、Prime Video、Apple TV+、DAZN、TikTok 等重点娱乐服务保持独立；
- 美国长尾流媒体统一，港澳台普通媒体统一，B站港澳台独立，B站东南亚归入东南亚媒体；
- OneDrive 与 iCloud 共用云盘组，Instagram 并入社交媒体，Bing 并入微软服务；
- 游戏平台与游戏下载分开，音乐服务共用 `🎵 音乐平台`；
- `🔞 NSFW` 只使用高置信锚定域名，不使用宽关键词、公共后缀或共享云/CDN 根域；
- `global-web`、`academic`、`yahoo`、`community-overrides`、`streaming-legacy` 已删除，普通 proxy/manual-first 流量由 `🐟 漏网之鱼` 接管。

## 路由安全

- 所有 `IP-CIDR`、`IP-CIDR6`、`IP-SUFFIX`、`IP-ASN`、`GEOIP` 等目标 IP 规则必须带 `no-resolve`；
- 所有 DIRECT-default 策略禁止 `DOMAIN-KEYWORD`，避免品牌字符串仿冒域名绕过代理 FINAL；
- 六个 late recovery ruleset 位于 `china-web/GEOIP,CN,no-resolve` 之后、唯一 FINAL 之前，只恢复历史 DIRECT-default、否则会落入代理 FINAL 的首有效 matcher；
- 原 proxy/manual-first 规则仍可交给 FINAL，当前细分规则与国内 GEOIP 继续优先；
- recovery 是历史默认路由兼容层，不代表对历史域名或 IP 当前所有权的确认。

`no-resolve` 能避免目标 IP 规则为匹配域名而主动解析，但不能替代客户端侧的 DNS 劫持、加密 DNS、TUN 或 `strict-route` 配置。

## 项目边界

Ekko Rules 采用与 ACL4SSR 在线预设相同的职责边界：

- 不保存代理节点或订阅凭据；
- 不接管端口、DNS、TUN、控制器等客户端设置；
- 只维护规则、规则顺序、策略组以及规则到策略组的映射；
- `sources/` 是唯一规范源；
- `generated/reversed-profile/` 只能由生成器重建。

## 开发与验证

要求 Python 3.12：

```bash
python -m pip install -r requirements.txt
python scripts/generate_profile.py
python scripts/validate_generated.py
python scripts/generate_profile.py --check
python -m unittest discover -s tests -v
```

生成器使用同盘 staging 和原子目录替换。验证门禁覆盖生成文件闭集、顺序、唯一 FINAL、Provider、SHA-256、敏感信息、strict CIDR、`no-resolve`、DIRECT-default 锚定规则，以及 Phase 2/3 迁移与 recovery 台账。

## 许可证与声明

本项目采用 [MIT License](LICENSE)。来源与规则重合说明、商标声明及免责声明见 [`NOTICE.md`](NOTICE.md) 和 [`docs/PROVENANCE.md`](docs/PROVENANCE.md)。
