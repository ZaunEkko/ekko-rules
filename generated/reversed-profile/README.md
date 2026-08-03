# Ekko Rules

[English](README_EN.md)

面向 Subconverter 与 Mihomo 的单一标准分流规则产品。本目录由仓库规范源确定性生成，不包含代理服务器、密码、UUID、密钥或真实订阅地址。

## 入口

- `config/ekko-rules.ini`：Subconverter 在线预设，不接管 Clash 基础配置。
- `Mihomo/reversed-template.yaml`：Mihomo 模板，使用前替换订阅地址占位符。
- `Ruleset/*.list` 与 `Providers/Ruleset/*.yaml`：两个入口依赖的同一套规则。
- `analysis.json` 与 `manifest.json`：质量统计及 SHA-256 文件清单。

## 在线订阅转换

打开支持自定义远程配置的 Subconverter 前端：推荐 `https://sub.v1.mk/`，它支持 AnyTLS 等较新协议；`https://acl4ssr-sub.github.io/` 是常用备选，但协议支持较旧，可能无法转换 AnyTLS 等较新协议。订阅链接填写自己的节点订阅，生成类型选择 `Clash`，远程配置填写：

```text
https://raw.githubusercontent.com/ZaunEkko/ekko-rules/main/generated/reversed-profile/config/ekko-rules.ini
```

粘贴完整地址后，下拉列表会出现相同的完整 URL；必须点击该 URL 候选项完成选择，不能只粘贴或只按 Enter。成功后输入框会变回只读状态并完整显示该 URL。确认不再显示“默认”后再生成订阅链接。不要只看输入框是否有空格：部分前端会在提交时自动插入前导空格，必须检查最终生成地址是 `config=https%3A...` 而不是 `config=%20https%3A...`。若出现 `%20`，请删除远程配置、重新粘贴并点击完整 URL 候选，再生成并复查，直到 `%20` 消失；否则转换器可能读取失败并回退到网站默认预设。请仅使用可信转换后端，因为它通常能够看到提交给它的原始订阅地址。

Ruleset 地址前缀：`https://raw.githubusercontent.com/ZaunEkko/ekko-rules/main/generated/reversed-profile/Ruleset`。

## 重点分流

- OpenAI、Claude 独立，Gemini、Grok、Microsoft AI、Cursor 等归入海外 AI；
- YouTube、Netflix、Disney+、Apple TV+、HBO GO/MAX、Prime Video、DAZN 等重点流媒体单独处理；HBO GO 与 Max 共用一组，DAZN 保持独立；
- 美国长尾统一归入 `🎬 美国流媒体`，港澳台、B站港澳台、东南亚、日本、韩国和国内流媒体分别处理；
- 游戏平台与游戏下载分开；社交、聊天、Discord 和邮件分别处理；
- `🧑‍💻 开发服务` 覆盖 GitHub、GitLab、Docker、Maven、Node.js 官网/文档/下载，以及 npm 官网、公共 Registry 和包下载；
- 音乐、云盘、Microsoft、Apple、Google 和国内网站均有对应分组；`🔞 NSFW` 默认 `REJECT`，仍可手动改为节点或 `DIRECT`；
- 未命中规则的流量交给 `🐟 漏网之鱼`。

除 `🔞 NSFW` 默认选择 `REJECT` 外，其余策略组保持手动选择；所有组均可自行切换，不启用自动测速。

## 中国大陆域名、IP 与 DNS

末尾路由顺序固定为：

```text
全部细分规则
→ 六个 late-recovery ruleset
→ 经典中国大陆域名规则
→ GEOIP,CN,DIRECT,no-resolve
→ MATCH,🐟 漏网之鱼
```

经典域名层仅使用固定版本来源筛选出的 `DOMAIN` 与 `DOMAIN-SUFFIX`，不使用 `GEOSITE`、`DOMAIN-KEYWORD`、正则或单标签/公共后缀兜底。命中后进入默认 `DIRECT` 的 `🌏 国内网站`。

末尾 GEOIP 继续补充中国大陆目标 IP。`no-resolve` 阻止该匹配器主动解析域名；客户端已有目标 IP 时仍可匹配。所有目标 IP 规则均保留 `no-resolve`，未命中的流量进入 `🐟 漏网之鱼`。

唯一产品包含 61 个 ruleset、62 个区段和 36 个策略组，不提供自动测速、Full、local 或 Extended 变体。
