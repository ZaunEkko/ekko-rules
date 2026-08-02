# Ekko Rules

[English](README_EN.md)

面向 Subconverter 与 Mihomo 的可复用分流规则和订阅模板。本目录由仓库内脱敏规范源确定性生成，不包含代理服务器、密码、UUID、密钥或真实订阅地址。

## 产物

- `config/ekko-rules.ini`：默认 Core 在线预设，不覆盖 Subconverter 服务端的 Clash 基础配置。
- `config/ekko-rules-full.ini`：Core + 脱敏基础配置；不暗含 optional 规则。
- `config/ekko-rules-local.ini`：本地 Core 预设，基础配置默认注释。
- `config/ekko-rules-extended.ini`：Core + EMBY 社区、Spotify legacy 与 Qobuz 品牌防御 optional 规则，不覆盖基础配置。
- `config/ekko-rules-extended-local.ini`：本地 Extended 预设。
- `base/GeneralClashConfig.yml`：可选且脱敏的 Clash 基础配置。
- `Ruleset/*.list`：供 Subconverter 使用的经典规则集。
- `Providers/Ruleset/*.yaml`：供 Mihomo 使用的 classical Rule Provider。
- `Mihomo/reversed-template.yaml`：默认 Core Mihomo 模板。
- `Mihomo/reversed-template-extended.yaml`：Extended Mihomo 模板。
- `analysis.json`：由当前规范源计算的结构与质量统计。
- `manifest.json`：生成文件清单和 SHA-256；清单不递归哈希自身。

## 使用

1. 发布后，Ruleset 地址前缀为 `https://raw.githubusercontent.com/ZaunEkko/ekko-rules/main/generated/reversed-profile/Ruleset`。
2. Subconverter 推荐使用 `config/ekko-rules.ini`；端口、DNS、TUN 等由服务端或客户端负责。
3. Mihomo 用户需要将模板中的 `PUT_YOUR_SUBSCRIPTION_URL_HERE` 替换为自己的订阅地址。
4. 仓库保持私有时，外部客户端通常无法匿名读取 GitHub Raw 地址。

## 行为说明

- Core 为 59 个 ruleset、60 个区段、37 个策略组。
- Extended 为 63 个 ruleset、64 个区段、38 个策略组。
- OpenAI、Claude 与海外 AI 独立；海外 AI 按 Google、xAI、Microsoft 与开发工具拆分 ruleset 后共用策略组。
- 重点流媒体保持独立；美国长尾、港澳台、东南亚和其他国外媒体按地区合并，B站港澳台继续独立。
- NSFW 只包含 38 条高置信域名，不使用宽 keyword、公共后缀或共享云/CDN 根域。
- 泛网站、学术、Yahoo、个人社区和历史流媒体规则已删除，原 proxy/manual-first 普通流量交给 `🐟 漏网之鱼`。
- `china-web/GEOIP,CN` 之后、FINAL 之前的六个 late recovery ruleset 只恢复历史 DIRECT-default 路由；当前细分规则和国内 GEOIP 继续优先。
- 所有目标 IP 规则统一带 `no-resolve`；Private 基础层直接指向 `DIRECT`。
- 同一区段 exact 重复已清零；5 条非 strict CIDR 已删除而未猜测改写前缀。
- DNS、TUN、Hosts 和节点凭据不属于核心规则职责。
