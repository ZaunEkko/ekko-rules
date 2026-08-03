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

## 行为

- 唯一产品包含 59 个 ruleset、60 个区段、37 个策略组，不提供自动测速、Full、local 或 Extended 变体。
- OpenAI、Claude、海外 AI、重点流媒体、游戏与 NSFW 保持特化。
- 六个 late recovery 只恢复历史 DIRECT-default 路由；所有 DIRECT-default 域名规则必须使用锚定 matcher。
- 所有目标 IP 规则带 `no-resolve`；DNS、TUN、Hosts 和节点凭据由客户端负责。
