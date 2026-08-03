# Ekko Rules

[English](README_EN.md)

面向 Subconverter 与 Mihomo 的 AI、娱乐、游戏与 NSFW 特化分流规则。

## 快速使用

### Subconverter 在线转换

打开支持自定义远程配置的 Subconverter 前端：

| 前端 | 建议用途 |
|---|---|
| [`https://sub.v1.mk/`](https://sub.v1.mk/) | **推荐**。支持 AnyTLS 等较新协议，订阅包含新协议节点时优先使用。 |
| [`https://acl4ssr-sub.github.io/`](https://acl4ssr-sub.github.io/) | 常用备选，但协议支持较旧，可能无法转换 AnyTLS 等较新协议。 |

订阅转换由三个部分协作完成：

| 部分 | 作用与信任边界 |
|---|---|
| 转换前端 | 提供填写订阅地址、目标格式和远程配置的网页界面，并把转换请求提交给后端。 |
| 转换后端 | 实际拉取你的真实订阅与 Ekko Rules 远程配置，再生成转换结果；**后端运营方能够知道完整的真实订阅地址，包括其中的 token。** |
| Ekko Rules | 仅提供公开规则、顺序、策略组和映射；不接收、不保存，也无法看到用户提交给转换后端的订阅地址。 |

仅自行托管前端、但仍调用公共转换后端，不能隐藏真实订阅地址；需要保护这项信息时，应同时自托管或选择可信的转换后端。

按以下方式填写：

| 项目 | 填写内容 |
|---|---|
| 订阅链接 | 你自己的机场或节点订阅地址 |
| 生成类型 | `Clash` |
| 远程配置 | 下方 Ekko Rules Raw 地址 |

```text
https://raw.githubusercontent.com/ZaunEkko/ekko-rules/main/generated/reversed-profile/config/ekko-rules.ini
```

在“远程配置”输入框中粘贴完整地址后，下拉列表会出现一条相同的完整 URL。**必须点击这条 URL 候选项完成选择**，不能只粘贴或只按 Enter；成功后输入框会变回只读状态并完整显示该 URL。确认不再显示“默认”后，再点击“生成订阅链接”。**不要只看输入框中是否有空格，必须检查最终生成的定制订阅地址**：有些前端会在提交时自动在远程配置前插入空格。正确结果应包含 `config=https%3A%2F%2Fraw.githubusercontent.com%2FZaunEkko%2Fekko-rules%2F...%2Fekko-rules.ini`，`config=` 后立即是 `https`；如果出现 `config=%20https...`，其中 `%20` 就是前导空格。此时应删除远程配置、重新粘贴并点击完整 URL 候选，再生成并复查，直到 `%20` 消失。若缺少 `config=` 或仍为 `config=%20https...`，转换器可能读取失败并回退到网站默认预设，而不是 Ekko Rules 的 38 个策略组。

> 转换后端必须获得完整订阅地址才能拉取节点并完成转换，因此不要把它当作匿名中转。请使用可信后端或自行部署转换后端；不要在 Issue、PR、日志或公开聊天中粘贴带 token 的真实订阅链接。

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

## 重点分流

Ekko Rules 主要面向需要单独选择节点或地区的场景：

- **广告拦截**：`🛑 广告拦截` 使用固定版本、锚定域名规则并默认 `REJECT`；仍可手动改为节点或 `DIRECT`；
- **AI 与设计工具分流**：OpenAI、Claude 独立分组；Gemini、Grok、Microsoft AI、Cursor、Hugging Face、Perplexity、Poe、OpenRouter、Mistral、Groq、Figma，以及 Kimi、Z.ai、Qwen、MiniMax 等国际站统一归入 `🧲 海外 AI`；DeepSeek、小红书和国产 AI 大陆站进入默认直连的 `🌏 国内网站`；
- **主流流媒体**：YouTube、Netflix、Disney+、Apple TV+、`🎬 HBO GO/MAX`、Prime Video、DAZN、TikTok 等重点服务单独处理；HBO GO 与 Max 共用一组，DAZN 保持独立；
- **区域媒体**：美国长尾统一归入 `🎬 美国流媒体`，港澳台、B站港澳台、东南亚、日本、韩国、爱奇艺和国内流媒体分别处理；
- **游戏分流**：`🎮 游戏平台` 与 `🎮 游戏下载` 分开，方便平台访问和大流量下载选择不同线路；
- **社交与通信**：社交媒体、聊天软件、Discord 和邮件分别处理；
- **远程串流**：`🖥️ 远程串流` 默认 `DIRECT`，覆盖 Tailscale、ZeroTier、Moonlight、Sunshine、Parsec、RustDesk、AnyDesk、TeamViewer、NetBird、Chrome Remote Desktop、Steam Link 和 Microsoft RDP 等高流量远程访问链路，避免远程桌面、游戏串流或虚拟局域网流量绕行代理；
- **开发服务**：`🧑‍💻 开发服务` 第一项为 `♻️ 手动切换`，覆盖 GitHub、GitLab、Docker/GHCR、Maven/Gradle、Node.js/npm、Python/PyPI、Rust/Cargo、Go、NuGet、RubyGems、Composer、Homebrew、CocoaPods 等官网、API、包仓库和下载链路；用户在意代理流量时可临时切到 `DIRECT`；
- **其他重点流量**：音乐平台、云盘、Microsoft、Apple、Google 和国内网站均有对应分组；`🔞 NSFW` 默认使用 `REJECT` 拦截，仍可手动改为节点或 `DIRECT`；
- **最终兜底**：没有命中上述规则的流量交给 `🐟 漏网之鱼`。

`🛑 广告拦截` 与 `🔞 NSFW` 默认选择 `REJECT`；所有策略组均可由用户自行切换，不启用自动测速。若广告拦截影响个别应用的登录、播放、购买、通知或遥测，可临时把 `🛑 广告拦截` 改为 `DIRECT` 或其他策略。

## 中国大陆域名、IP 与 DNS

末尾路由顺序固定为：

```text
全部细分规则
→ 六个 late-recovery ruleset
→ 经典中国大陆域名规则
→ GEOIP,CN,DIRECT,no-resolve
→ MATCH,🐟 漏网之鱼
```

经典域名层使用固定版本来源筛选出的 `DOMAIN` 与 `DOMAIN-SUFFIX`，覆盖常见大陆服务域名，不使用已弃用的 `GEOSITE`，也不使用 `DOMAIN-KEYWORD`、正则或单标签/公共后缀兜底。它在不触发额外 DNS 查询的情况下把命中的域名交给 `🌏 国内网站`（默认 `DIRECT`）。

末尾的 `GEOIP,CN,DIRECT,no-resolve` 继续补充中国大陆目标 IP：`no-resolve` 阻止该匹配器为了判断域名而主动发起 DNS 查询；若客户端此前已经得到目标 IP，GEOIP 仍可使用该 IP 完成匹配。若域名未被经典域名层覆盖、当时也没有可用目标 IP，则流量继续进入 `🐟 漏网之鱼`。Ekko Rules 保留所有目标 IP 规则的 `no-resolve`，不发布会主动解析的变体。

## 路由安全

- 所有目标 IP 规则都带 `no-resolve`；
- 所有默认直连的域名规则禁止宽泛 `DOMAIN-KEYWORD`，避免仿冒域名被错误直连；
- 大陆域名层仅使用锚定 `DOMAIN` / `DOMAIN-SUFFIX`，且位于六段恢复之后、中国 GEOIP 与最终兜底之前；
- 没有命中规则的流量由 `🐟 漏网之鱼` 接管。

## 反馈与规则建议

请使用结构化 Issue Form：

- [➕ 域名或服务规则建议](https://github.com/ZaunEkko/ekko-rules/issues/new?template=domain-addition.yml)
- [🧭 策略组或映射调整](https://github.com/ZaunEkko/ekko-rules/issues/new?template=policy-group-change.yml)
- [🐛 误分类或规则问题](https://github.com/ZaunEkko/ekko-rules/issues/new?template=routing-problem.yml)

提交前请阅读 [`CONTRIBUTING.md`](CONTRIBUTING.md) 和 [`SUPPORT.md`](SUPPORT.md)。你也可以让自己的 coding agent 先阅读贡献规范，再代为整理 Issue：

```text
请阅读 https://github.com/ZaunEkko/ekko-rules/blob/main/CONTRIBUTING.md，
再按仓库的 Issue Form 帮我整理问题。只使用公开域名和公开证据；
不要读取或提交订阅 URL、token、节点地址/端口、密码、UUID、私钥或完整客户端配置。
提交前先把最终正文给我确认。
```

若已经公开凭据，请立即吊销或轮换；删除或编辑 Issue 不能让凭据重新安全。

## 项目边界

Ekko Rules 的职责边界：

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
