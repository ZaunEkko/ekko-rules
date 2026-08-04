# Ekko Rules

[English](README_EN.md)

面向 Subconverter 与 Mihomo 的单一标准分流规则产品。本目录由仓库规范源确定性生成，不包含代理服务器、密码、UUID、密钥或真实订阅地址。

## 入口

- `config/ekko-rules.ini`：Subconverter 在线预设，不接管 Clash 基础配置。
- `Mihomo/reversed-template.yaml`：Mihomo 模板，使用前替换订阅地址占位符。
- `Ruleset/*.list` 与 `Providers/Ruleset/*.yaml`：两个入口依赖的同一套规则；`onedrive`、`icloud`、`spotify-2` 仅保留合并前原始内容的旧 Raw URL 兼容副本，不进入活动模板或规则计数。
- `analysis.json` 与 `manifest.json`：质量统计及 SHA-256 文件清单，兼容副本同样纳入哈希闭集。

## 在线订阅转换

订阅转换由三个部分协作：转换前端提供输入界面并向后端提交请求；转换后端实际拉取真实订阅和 Ekko Rules 远程配置，因此后端运营方能够知道包含 token 的完整订阅地址；Ekko Rules 只提供公开规则、顺序、策略组和映射，不接收或保存用户订阅。仅自托管前端但继续调用公共后端，不能隐藏订阅地址；需要保护它时，应使用可信或自托管的转换后端。

打开支持自定义远程配置的 Subconverter 前端：推荐 `https://sub.v1.mk/`，它支持 AnyTLS 等较新协议；`https://acl4ssr-sub.github.io/` 是常用备选，但协议支持较旧，可能无法转换 AnyTLS 等较新协议。订阅链接填写自己的节点订阅，生成类型选择 `Clash`，远程配置填写：

```text
https://raw.githubusercontent.com/ZaunEkko/ekko-rules/main/generated/reversed-profile/config/ekko-rules.ini
```

粘贴完整地址后，下拉列表会出现相同的完整 URL；必须点击该 URL 候选项完成选择，不能只粘贴或只按 Enter。成功后输入框会变回只读状态并完整显示该 URL。确认不再显示“默认”后再生成订阅链接。不要只看输入框是否有空格：部分前端会在提交时自动插入前导空格，必须检查最终生成地址是 `config=https%3A...` 而不是 `config=%20https%3A...`。若出现 `%20`，请删除远程配置、重新粘贴并点击完整 URL 候选，再生成并复查，直到 `%20` 消失；否则转换器可能读取失败并回退到网站默认预设。转换后端必须获得完整订阅地址才能拉取节点并完成转换，因此不要把它当作匿名中转。

Ruleset 地址前缀：`https://raw.githubusercontent.com/ZaunEkko/ekko-rules/main/generated/reversed-profile/Ruleset`。

## 重点分流

- `🛑 广告拦截` 使用固定版本锚定域名规则并默认 `REJECT`，仍可手动改为节点或 `DIRECT`；
- OpenAI、Claude 独立，Gemini、Grok、Microsoft AI、Cursor、Figma 及 Kimi、Z.ai、Qwen、MiniMax 国际站等归入海外 AI；DeepSeek、小红书和国产 AI 大陆站进入默认直连的国内网站；
- YouTube、Netflix、Disney+、Apple TV+、HBO GO/MAX、Prime Video、DAZN 等重点流媒体单独处理；HBO GO 与 Max 共用一组，DAZN 保持独立；
- 美国长尾统一归入 `🎬 美国流媒体`，港澳台、B站港澳台、东南亚、日本、韩国和国内流媒体分别处理；
- 游戏平台与游戏下载分开；社交、聊天、Discord 和邮件分别处理；
- `🖥️ 远程串流` 默认 `DIRECT`，覆盖 Tailscale、ZeroTier、Moonlight、Sunshine、Parsec、RustDesk、AnyDesk、TeamViewer、NetBird、Chrome Remote Desktop、Steam Link 和 Microsoft RDP，防止远程访问大流量绕行代理；
- `🧑‍💻 开发服务` 第一项为 `♻️ 手动切换`，覆盖主流开发官网、API、包仓库和下载链路；用户可临时改为 `DIRECT`；
- `☁️ 国内云服务` 默认 `DIRECT`，覆盖国内云官网、控制台、API、对象存储和 CDN；`☁️ 海外云服务` 默认 `♻️ 手动切换`，覆盖全球 AWS、Azure、Google Cloud、Cloudflare、DigitalOcean、Vultr、Linode/Akamai、Oracle Cloud 及国内厂商海外区域端点；广告和具体业务规则仍优先；
- 音乐、云盘、Microsoft、Apple、Google 和国内网站均有对应分组；`🔞 NSFW` 默认 `REJECT`，仍可手动改为节点或 `DIRECT`；
- 未命中规则的流量交给 `🐟 漏网之鱼`。

`🛑 广告拦截` 与 `🔞 NSFW` 默认选择 `REJECT`；所有策略组均可自行切换，不启用自动测速。若拦截影响个别应用功能，可临时把广告组改为 `DIRECT` 或其他策略。

## 中国大陆域名、IP 与 DNS

末尾路由顺序固定为：

```text
全部具体业务规则
→ 五个非微软 late-recovery ruleset
→ 海外云服务 → 国内云服务
→ 微软服务及其 late-recovery → Google
→ 经典中国大陆域名规则
→ GEOIP,CN,DIRECT,no-resolve
→ MATCH,🐟 漏网之鱼
```

经典域名层仅使用固定版本来源筛选出的 `DOMAIN` 与 `DOMAIN-SUFFIX`，不使用 `GEOSITE`、`DOMAIN-KEYWORD`、正则或单标签/公共后缀兜底。命中后进入默认 `DIRECT` 的 `🌏 国内网站`。

末尾 GEOIP 继续补充中国大陆目标 IP。`no-resolve` 阻止该匹配器主动解析域名；客户端已有目标 IP 时仍可匹配。所有目标 IP 规则均保留 `no-resolve`，未命中的流量进入 `🐟 漏网之鱼`。

唯一产品包含 63 个 ruleset、64 个区段和 40 个策略组，不提供自动测速、Full、local 或 Extended 变体。
