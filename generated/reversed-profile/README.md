# Ekko Rules

[English](README_EN.md)

面向 Subconverter 与 Mihomo 的单一标准分流规则产品。本目录由仓库规范源确定性生成，不包含代理服务器、密码、UUID、密钥或真实订阅地址。

## 入口

- `config/ekko-rules.ini`：Subconverter 在线预设，不接管 Clash 基础配置。
- `Mihomo/reversed-template.yaml`：Mihomo 模板，使用前替换订阅地址占位符。
- `Ruleset/*.list` 与 `Providers/Ruleset/*.yaml`：两个入口依赖的同一套规则。
- `analysis.json` 与 `manifest.json`：质量统计及 SHA-256 文件清单。

## 在线订阅转换

打开支持自定义远程配置的 Subconverter 前端，例如 `https://sub.v1.mk/`。订阅链接填写自己的节点订阅，生成类型选择 `Clash`，远程配置填写：

```text
https://raw.githubusercontent.com/ZaunEkko/ekko-rules/main/generated/reversed-profile/config/ekko-rules.ini
```

粘贴完整地址并按 Enter 选中，然后生成订阅链接。请仅使用可信转换后端，因为它通常能够看到提交给它的原始订阅地址。

Ruleset 地址前缀：`https://raw.githubusercontent.com/ZaunEkko/ekko-rules/main/generated/reversed-profile/Ruleset`。

## 重点分流

- OpenAI、Claude 独立，Gemini、Grok、Microsoft AI、Cursor 等归入海外 AI；
- YouTube、Netflix、Disney+、Apple TV+、Max、Prime Video 等重点流媒体独立；
- 美国长尾、港澳台、B站港澳台、东南亚、日本、韩国和国内流媒体分别处理；
- 游戏平台与游戏下载分开；社交、聊天、Discord、邮件和开发服务分别处理；
- 音乐、云盘、Microsoft、Apple、Google、NSFW 和国内网站均有对应分组；
- 未命中规则的流量交给 `🐟 漏网之鱼`。

全部 37 个策略组均为手动选择，不启用自动测速。

## 中国 IP 与 DNS 取舍

默认生成：

```text
GEOIP,CN,DIRECT,no-resolve
```

`no-resolve` 可降低 GEOIP 匹配额外触发 DNS 查询所带来的泄露风险，但部分国内域名可能无法在这一规则命中，访问可能绕远或变慢。若对此不敏感，可在自己的配置中删除 `no-resolve`，改为 `GEOIP,CN,DIRECT`。是否实际发生 DNS 泄露取决于客户端的 DNS、TUN、路由和加密 DNS 设置。

唯一产品包含 60 个 ruleset、61 个区段和 37 个策略组，不提供自动测速、Full、local 或 Extended 变体。
