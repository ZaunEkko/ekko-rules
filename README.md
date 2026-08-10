# Ekko Rules

[English](README_EN.md)

面向 Mihomo、sing-box 与主流代理客户端的本地订阅生成器和特化分流规则。既可以通过 Docker 在自己的电脑上生成完整配置，也可以把公开规则用于第三方 Subconverter 或 Mihomo 原生模板。

## 选择使用方式

| 方式 | 适合谁 | 真实订阅由谁获取 | 生成结果 |
|---|---|---|---|
| **本地自托管（推荐）** | 希望订阅留在自己电脑、直接导入完整配置 | 自己的 Docker | 固定本地 URL，可反复刷新 |
| 第三方在线转换 | 不方便运行 Docker、接受信任转换后端 | 第三方后端 | 第三方订阅 URL |
| Mihomo 原生模板 | 只需要 Ekko Rules，其他客户端设置自己维护 | Mihomo 客户端 | Provider 模板 |

### 推荐：本地自托管完整订阅

需要 Docker 与 Docker Compose v2。Windows 首次部署推荐使用一次性安装入口：

```bash
git clone https://github.com/ZaunEkko/ekko-rules.git
cd ekko-rules/selfhost

# Windows：启动 Compose，并安装当前用户的局域网 IP 自启动助手
setup.cmd

# macOS / Linux
sh ./start.sh
```

已经位于仓库目录时，只需：

```bash
cd selfhost
setup.cmd
```

`setup.cmd` 只需运行一次。Compose 中的 Web 与转换器使用 `restart: unless-stopped`，以后 Docker Desktop 开机恢复容器时，Windows 登录任务也会自动恢复局域网 IP 检测；用户仍可在 Docker Desktop 中可视化启动、停止和重启容器。`start.cmd` 只启动当前会话，`docker compose up --build -d` 则始终可作为不安装宿主机助手的标准启动方式。

打开 [http://127.0.0.1:8787](http://127.0.0.1:8787)，粘贴真实订阅、选择客户端并创建本地订阅。把生成的地址导入客户端一次即可：

```text
http://127.0.0.1:8787/sub/<随机 ID>
```

以后只要 Docker 正在运行，客户端刷新原地址就会重新拉取上游并即时生成配置；不需要重新创建地址。普通停止、重启或 `docker compose down` 都会保留它，只有 `docker compose down -v` 会删除保存档案的数据卷。

固定地址也可以直接给同一局域网内的手机、平板和路由器使用。Docker 默认发布 Web 端口到宿主机所有网卡；Windows 首次运行 `setup.cmd` 后，轻量宿主机助手会随登录自动识别并持续刷新电脑当前局域网 IP。地址工具与保存的订阅放在同一区域，可以在 `localhost`、自动识别地址、自定义电脑 IP 和最近使用过的地址之间切换前缀。选择局域网模式后，换网络得到的新 IP 会自动应用到显示、复制和本地二维码，而 `/sub/<随机 ID>` 保持不变。具体说明见 [`selfhost/README.md`](selfhost/README.md#手机与路由器使用局域网订阅)。

| 能力 | 当前行为 |
|---|---|
| 完整配置 | Mihomo 输出包含节点、端口、DNS、策略组和 Ekko Rules，可直接导入 |
| 输出格式 | Mihomo / Clash、sing-box、Surge 4+、Quantumult X、Loon、Surfboard、Quantumult、Mellow |
| 新协议 | Mihomo 与 sing-box 已验证 AnyTLS、VLESS Reality、Hysteria2、TUIC |
| 固定地址 | 电脑、手机或路由器可导入；Docker 重启后档案路径继续有效 |
| 多网络切换 | 局域网模式自动跟随新 IP；也可在 `localhost`、当前地址、自定义前缀和最近 8 个地址之间切换 |
| 手机导入 | Mihomo / Clash 可用系统相机一键唤起客户端，也可在客户端内扫描原始 URL；两种二维码均在浏览器本地生成 |
| 高级选项 | Emoji、UDP、TFO、TLS 1.3、VLESS/VMess XUDP、sing-box IPv6、节点筛选/排序/重命名、自定义 User-Agent 等 |
| 更新方式 | 自动更新默认关闭；启用后可选择 1–168 小时，关闭时仍可手动刷新 |
| 套餐信息 | 上游提供 `Subscription-Userinfo` 时，透传流量、容量和到期时间 |

真实订阅地址只保存在本机 Docker 数据卷中，生成结果不会暴露上游订阅 URL；转换引擎端口也不会发布到宿主机。固定 URL 中的随机 ID 相当于本地访问凭据，不应公开分享。完整使用说明、安全边界和故障排查见 [`selfhost/README.md`](selfhost/README.md)。

### 备用：Subconverter 在线转换

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

<details>
<summary>远程配置没有生效，或生成地址中出现 <code>%20</code> 时展开</summary>

在“远程配置”输入框中粘贴完整地址后，下拉列表会出现一条相同的完整 URL。**必须点击这条 URL 候选项完成选择**，不能只粘贴或只按 Enter；成功后输入框会变回只读状态并完整显示该 URL。确认不再显示“默认”后，再点击“生成订阅链接”。**不要只看输入框中是否有空格，必须检查最终生成的定制订阅地址**：有些前端会在提交时自动在远程配置前插入空格。正确结果应包含 `config=https%3A%2F%2Fraw.githubusercontent.com%2FZaunEkko%2Fekko-rules%2F...%2Fekko-rules.ini`，`config=` 后立即是 `https`；如果出现 `config=%20https...`，其中 `%20` 就是前导空格。此时应删除远程配置、重新粘贴并点击完整 URL 候选，再生成并复查，直到 `%20` 消失。若缺少 `config=` 或仍为 `config=%20https...`，转换器可能读取失败并回退到网站默认预设，而不是 Ekko Rules 的 40 个策略组。

</details>

> 转换后端必须获得完整订阅地址才能拉取节点并完成转换，因此不要把它当作匿名中转。请使用可信后端或自行部署转换后端；不要在 Issue、PR、日志或公开聊天中粘贴带 token 的真实订阅链接。

### 仅使用规则：Mihomo 原生模板

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
- **游戏分流**：中国大陆游戏平台、登录、社区和语音进入默认直连的 `🌏 国内网站`，专用下载端点进入默认直连的 `🎮 游戏下载`；`🎮 游戏平台` 仅承载海外平台并默认使用 `♻️ 手动切换`；
- **社交与通信**：社交媒体、聊天软件、Discord 和邮件分别处理；
- **远程串流**：`🖥️ 远程串流` 默认 `DIRECT`，覆盖 Tailscale、ZeroTier、Moonlight、Sunshine、Parsec、RustDesk、AnyDesk、TeamViewer、NetBird、Chrome Remote Desktop、Steam Link 和 Microsoft RDP 等高流量远程访问链路，避免远程桌面、游戏串流或虚拟局域网流量绕行代理；
- **开发服务**：`🧑‍💻 开发服务` 第一项为 `♻️ 手动切换`，除代码托管与语言包生态外，还覆盖 Linear、Notion、Slack、Atlassian、Postman、Sentry、Vercel、Supabase、主流 CI/CD、可观测平台、开发数据库和在线 IDE 的官网、控制台、API 与必要资源链路；用户在意代理流量时可临时切到 `DIRECT`；通用 CDN、对象存储及用户托管站点仍不纳入；
- **云基础设施**：`☁️ 国内云服务` 默认 `DIRECT`，覆盖国内云官网、控制台、API、对象存储和 CDN；`☁️ 海外云服务` 默认 `♻️ 手动切换`，覆盖全球 AWS、Azure、Google Cloud、Cloudflare、DigitalOcean、Vultr、Linode/Akamai、Oracle Cloud，以及国内厂商的海外区域端点；广告和具体业务规则仍优先；
- **其他重点流量**：音乐平台、云盘、Microsoft、Apple、Google 和国内网站均有对应分组；`🔞 NSFW` 默认使用 `REJECT` 拦截，仍可手动改为节点或 `DIRECT`；
- **最终兜底**：没有命中上述规则的流量交给 `🐟 漏网之鱼`。

`🛑 广告拦截` 与 `🔞 NSFW` 默认选择 `REJECT`；所有策略组均可由用户自行切换，不启用自动测速。若广告拦截影响个别应用的登录、播放、购买、通知或遥测，可临时把 `🛑 广告拦截` 改为 `DIRECT` 或其他策略。

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

- 公开规则与在线远程配置不保存代理节点或订阅凭据；本地自托管应用只在用户自己的 Docker 数据卷中保存固定 URL 所需的最少源地址映射；
- 公开 Mihomo 模板不接管端口、DNS、TUN、控制器等客户端设置；本地自托管入口会生成可直接导入的完整配置；
- 公开规则产品维护规则、顺序、策略组和映射；自托管应用只负责在本机获取订阅并调用固定版本的转换引擎；
- `sources/` 是规则产品的唯一规范源，`generated/reversed-profile/` 只能由生成器重建；
- `selfhost/` 包含独立的本地 Web 应用、转换引擎快照与 Docker Compose，不提供公网托管模式。

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
