<div align="center">

<img src="selfhost/app/src/app/icon.png" width="88" alt="Ekko Rules">

# Ekko Rules

**把机场订阅换成一份能直接导入的完整配置**

节点 · DNS · 策略组 · 分流规则，一个文件全给你

[![License](https://img.shields.io/github/license/ZaunEkko/ekko-rules?style=flat-square&color=1b1be0)](LICENSE)
[![Validate](https://img.shields.io/github/actions/workflow/status/ZaunEkko/ekko-rules/validate.yml?branch=main&style=flat-square&label=validate)](https://github.com/ZaunEkko/ekko-rules/actions/workflows/validate.yml)
[![Clients](https://img.shields.io/badge/clients-9-1b1be0?style=flat-square)](#三步拿到配置)
[![Shadowrocket](https://img.shields.io/badge/Shadowrocket-两步原生导入-1b1be0?style=flat-square)](#在自己电脑上跑一份)
[![Stored](https://img.shields.io/badge/stored-nothing-1b1be0?style=flat-square)](#三步拿到配置)

**[在线转换](https://sub.boxnook.cc)** · [自己部署](#在自己电脑上跑一份) · [规则说明](#重点分流) · [English](README_EN.md)

<!-- DEMO：待 sub.boxnook.cc 上线后补录操作动图，放在这里 -->

</div>

---

## 三步拿到配置

<!-- DEMO：待 sub.boxnook.cc 上线后补录操作动图 -->

**1.** 打开 **[sub.boxnook.cc](https://sub.boxnook.cc)**
**2.** 粘贴机场订阅地址（输入框默认打码）
**3.** 点「一键导入 Clash / Mihomo」（选哪个客户端，按钮就变成哪个）

完了。需要的话在「高级选项」里勾 UDP、XUDP 这类开关，链接会当场跟着变；也可以复制链接或扫码。Shadowrocket 例外：页面会明确给出 **① 节点订阅、② 分流配置** 两个按钮和两张二维码，必须按顺序都导入。第 1 步在首页建立可刷新的节点订阅、名称和流量/到期横幅；第 2 步在「配置」页导入规则、策略组与 `DIRECT` / `REJECT`。`site-v0.4.31` 已通过用户真机验收：配置模式可用，原生 `PROXY` 可调用首页当前节点，策略组也可选择首页节点、`DIRECT` 和嵌套的 `♻️ 手动切换`。

**这个站不保存你的订阅。** 没有账号也没有档案列表，转换用的订阅正文只写进内存、转换完即删，日志里不记录订阅地址。代价是**链接里带着你的订阅凭据**——只导入自己的客户端，不要转发。

规则默认用本仓库的 Ekko Rules，也可以在页面上换成 ACL4SSR 的常用几套，或粘贴自己的远程配置地址。

## 转不出来的两种常见原因

**机场把转换站挡了。** 公开转换站是从站点的服务器去拉你的订阅，机场看到的是一个陌生
IP，可能直接拒绝，也可能只认特定客户端的 User-Agent。按代价从小到大试：

1. 在页面的「高级选项」里换一个自定义 User-Agent，很多机场卡的只是这个；
2. **在自己电脑上跑一份**（下面那一节）。这时拉取从你自己的家宽发出，机场看到的是你
   本来就在用的 IP。注意部署到 VPS 并不等价：那仍是一个机房 IP，一样可能被挡。

**机场后台没开启订阅。** 不少机场默认关着订阅功能，换套餐或重置链接之后也会停用。
这时地址是通的，内容却是空的。去用户中心确认订阅已启用、链接是当前那条，必要时重置
一次再复制。

## 客户端里会改写配置的开关，不懂就别动

导入的是一份完整配置：节点、DNS、策略组、分流规则都在里面，而且互相依赖——规则要
准，靠的就是配套的那套 DNS 和策略组。

客户端普遍提供几个会**改写**这份配置的开关，打开就把对应的部分换成客户端自己的：

| 开关 | 改掉什么 |
|---|---|
| DNS 覆写 / DNS 设置 | 整段 `dns:`——国内外分开解析、fake-ip、加密上游 |
| Smart 内核 / 智能分组 | 策略组的类型与选路方式 |
| 全局扩展脚本 / Merge / Script | 配置的任意部分 |

**不了解它们在做什么，就让它们保持关闭。** 这边已经配好了。确实清楚自己在调什么，
再自己接管。

## 在自己电脑上跑一份

不想让任何第三方经手？同一套代码换个形态：真实订阅只交给本机 Docker，**连链接里都不会出现**，换回一个固定的本地地址，客户端导入一次以后一直刷新它。

```bash
git clone https://github.com/ZaunEkko/ekko-rules.git
cd ekko-rules/selfhost
docker compose up --build -d
```

打开 [http://127.0.0.1:8787](http://127.0.0.1:8787) 创建，得到 `http://127.0.0.1:8787/sub/<随机 ID>`。同一局域网的手机、平板和路由器换成电脑 IP 即可使用。

Windows 首次部署可以改用 `setup.cmd`，它顺带安装一个随登录运行的局域网 IP 助手，换 Wi-Fi 后页面里的地址会自动跟着更新。完整说明、安全边界与故障排查见 [`selfhost/README.md`](selfhost/README.md)。

| | 在线站 | 本地自托管 |
|---|---|---|
| 谁拉取你的订阅 | 站点服务器，转换完即丢 | 你自己的 Docker |
| 订阅是否进 URL | 是（所以别转发链接） | 否 |
| 固定地址 | 链接自带全部参数 | `/sub/<随机 ID>` |
| 需要装什么 | 什么都不用 | Docker + Compose v2 |

两种形态都输出 9 种客户端格式：Clash / Mihomo、Shadowrocket、sing-box、Surge 4+、Loon、Quantumult X、Surfboard、Quantumult、Mellow。Mihomo 与 sing-box 已验证保留 AnyTLS、VLESS Reality、Hysteria2 与 TUIC；其余格式按各自客户端实际支持的协议与字段输出。Shadowrocket 把“节点订阅”和“原生配置”作为两个独立对象，页面因此提供严格有序的两步导入。首页 `.yaml` 负责名称、节点刷新及流量/到期横幅；配置页 `.conf` 不再复制节点，而以原生 `PROXY` 保持配置模式联网，在每个策略组明确引用首页节点的名称，并保留规则、`♻️ 手动切换`、`DIRECT` / `REJECT`、策略组嵌套和默认选择。`site-v0.4.31` 的两步组合已由用户真机确认可在配置模式联网、选择节点、`DIRECT` 和组间手动切换；节点增删或改名后仍需刷新配置。两步缺一不可。内置完整版、精简版、ACL4SSR 等第三方预设及允许的自定义远程配置共用这条转换链路，但本次真机验收不等于每种第三方预设或节点协议均已逐一验证。高级选项涵盖 Emoji、UDP、TFO、TLS 1.3、XUDP、sing-box IPv6、节点筛选/排序/重命名、自定义 User-Agent 与自动更新间隔；上游返回 `Subscription-Userinfo` 时会安全透传流量、容量与到期字段。


## 只要规则，不要转换

### Mihomo 原生模板

```text
https://raw.githubusercontent.com/ZaunEkko/ekko-rules/main/generated/reversed-profile/Mihomo/reversed-template.yaml
```

精简版同样有一份：

```text
https://raw.githubusercontent.com/ZaunEkko/ekko-rules/main/generated/reversed-profile/Mihomo/reversed-template-lite.yaml
```

下载后把 `PUT_YOUR_SUBSCRIPTION_URL_HERE` 换成自己的订阅地址，再由 Clash Verge Rev 等 Mihomo 客户端加载。模板只提供代理 Provider、策略组、Rule Provider 和规则，不接管端口、DNS、TUN、控制器或其他客户端设置。

### 配合其它 Subconverter 前端

规则本身是公开的，也可以在任何支持自定义远程配置的 Subconverter 前端里使用：「生成类型」选 `Clash`，「远程配置」填下面两条之一。

完整版，44 个策略组：

```text
https://raw.githubusercontent.com/ZaunEkko/ekko-rules/main/generated/reversed-profile/config/ekko-rules.ini
```

精简版，10 个策略组，分流行为与完整版完全一致：

```text
https://raw.githubusercontent.com/ZaunEkko/ekko-rules/main/generated/reversed-profile/config/ekko-rules-lite.ini
```

> **转换后端能看到完整的真实订阅地址，包括其中的 token。** 这是所有在线转换的共性：后端必须拿到完整地址才能拉取节点。Ekko Rules 只提供公开规则，不接收也看不到任何人提交给别处的订阅；只自托管前端而仍调用公共后端，同样藏不住这个地址。介意这一点就用上面的两种形态之一。不要在 Issue、PR、日志或公开聊天里粘贴带 token 的订阅链接。

<details>
<summary>远程配置没有生效，或生成地址中出现 <code>%20</code> 时展开</summary>

某些前端会在提交时于远程配置前插入一个空格。粘贴完整地址后，如果下拉列表出现同样的完整 URL，**必须点击这条候选项完成选择**，不能只粘贴或只按 Enter。生成后检查最终的订阅地址：`config=` 后应立即是 `https`；若出现 `config=%20https...`，那个 `%20` 就是前导空格，需要删除远程配置重新粘贴并重新选择，直到它消失。否则转换器可能读取失败并回退到该站自己的默认预设，而不是 Ekko Rules 的策略组。

</details>

## 重点分流

Ekko Rules 主要面向需要单独选择节点或地区的场景：

- **广告拦截**：`🛑 广告拦截` 使用固定版本、锚定域名规则并默认 `REJECT`；仍可手动改为节点或 `DIRECT`；
- **AI 与设计工具分流**：OpenAI、Claude 独立分组；Gemini、Grok、Microsoft AI、Cursor、Hugging Face、Perplexity、Poe、OpenRouter、Mistral、Groq、Figma，以及 Kimi、Z.ai、Qwen、MiniMax 等国际站统一归入 `🧲 海外 AI`；官方海外生成平台也归入这一组，包括 Suno、Udio、AIVA、Stable Audio 等音乐/语音工具，Runway、Pika、Luma 等视频工具，Midjourney、Ideogram、Leonardo、Recraft 等图像设计工具与 Meshy 3D；只收录已核实的产品域名，不兜底共用 CDN 或所有 `.ai` 域名。DeepSeek、小红书，以及 Seko、可灵、Vidu、即梦、海螺、LiblibAI、RunningHub、吐司、MOKI、蝉镜等国产 AI 大陆站进入默认直连的 `🌏 国内网站`；
- **主流流媒体**：YouTube、Netflix、Disney+、Apple TV+、`🎬 HBO GO/MAX`、Prime Video、DAZN、TikTok 等重点服务单独处理；HBO GO 与 Max 共用一组，DAZN 保持独立；
- **区域媒体**：美国长尾统一归入 `🎬 美国流媒体`，港澳台、B站港澳台、东南亚、日本、韩国、爱奇艺和国内流媒体分别处理；已核验的量子、非凡、暴风、索尼、百度、闪电、火狐、速博、红牛、最大、iKun 等第三方视频接口及其专用播放域名进入默认直连的 `🌏 国内流媒体`，避免播放流量落入代理兜底；
- **游戏分流**：中国大陆游戏平台、登录、社区和语音进入默认直连的 `🌏 国内网站`，专用下载端点进入默认直连的 `🎮 游戏下载`；`🎮 游戏平台` 仅承载海外平台并默认使用 `♻️ 手动切换`；
- **社交与通信**：社交媒体、聊天软件、Discord 和邮件分别处理；
- **远程串流与实时通信**：拆成两组。`🖥️ 远程串流流量` 默认 `DIRECT`，承载真正的数据面——Tailscale 的 DERP 中继与控制面、ZeroTier 根服务器、Parsec 与 RustDesk 的会话端点、NetBird 信令与中继、Chrome 远程桌面，以及 ToDesk、向日葵、RayLink 和主流 RTC/IM 基础服务，避免远程桌面、语音或实时数据绕行代理；`🖥️ 远程串流后台` 默认 `♻️ 手动切换`，只收各家的管理后台与官网(Tailscale、ZeroTier、NetBird、Parsec、RustDesk、AnyDesk、TeamViewer、Moonlight)。分开的原因是一个厂商后缀同时盖着两件事：控制台在大陆直连打不开，而同后缀下的中继却承载着串流负载——任何一个策略单独套上去都是错的；
- **国内基础服务**：验证码、推送、国内代码与模型社区、协作文档、电子认证、主流教学平台以及明确的国区智能设备和车联网入口复用默认直连的 `🌏 国内网站`；只保留官方根域，国际共用设备云不做宽泛直连；
- **开发服务**：`🧑‍💻 开发服务` 第一项为 `♻️ 手动切换`，除代码托管与语言包生态外，还覆盖 Linear、Notion、Slack、Atlassian、Postman、Sentry、Vercel、Supabase、主流 CI/CD、可观测平台、开发数据库和在线 IDE 的官网、控制台、API 与必要资源链路；用户在意代理流量时可临时切到 `DIRECT`；通用 CDN、对象存储及用户托管站点仍不纳入；
- **Adobe**：`🎨 Adobe` 第一项为 `♻️ 手动切换`，覆盖 Creative Cloud、Acrobat、Behance、Adobe Stock、Typekit 等官方服务，可单独固定到兼容的非香港节点；精简版归入 `🚀 国外服务`；
- **云基础设施**：`☁️ 国内云服务` 默认 `DIRECT`，覆盖国内云官网、控制台、API、对象存储和 CDN；`☁️ 海外云服务` 默认 `♻️ 手动切换`，覆盖全球 AWS、Azure、Google Cloud、Cloudflare、DigitalOcean、Vultr、Linode/Akamai、Oracle Cloud，以及国内厂商的海外区域端点；广告和具体业务规则仍优先；
- **海外购物**：`🛒 海外购物` 默认 `♻️ 手动切换`，覆盖各区域亚马逊、eBay、Etsy 等欧美零售，DLsite、乐天、ZOZO、骏河屋、Mandarake、AmiAmi 等日本店铺，Buyee、ZenMarket、tenso 等转运代购，以及 Gmarket、SSG、Takealot 等地区电商。这类站点的店面内容、可购范围与人机验证都取决于出口 IP，独立成组便于单独挑节点；已在别处归类的不重复收录——阿里系的 Lazada 与 Shopee 大陆入口保持直连，Coupang 仍在 `🎬 韩国媒体`，`aws.amazon.com` 与 Prime Video 图床各自留在云与流媒体分组；
- **金融与账号注册**：`💳 金融服务` 默认 `♻️ 手动切换`，覆盖 Wise、PayPal、Payoneer、Revolut、Remitly、西联汇等支付汇款，WildCard、Dupay、Privacy.com 等虚拟卡，SMS-Activate、5SIM、SMSPVA、OnlineSIM、TextNow 等接码与虚拟号码，以及汇丰、花旗、大通、星展、渣打、盈富、盛陆、富途、moomoo、老虎等海外银行与券商。金融账号是按“在哪里用”被核对的，和历史不符的出口会触发验证甚至冻结；虚拟卡与接码在同一组，是因为注册时的地址就是账号日后被期待的地址。国内银行不在此组，仍由默认直连的 `🌏 国内网站` 承载；
- **其他重点流量**：音乐平台、云盘、Microsoft、Apple、Google 和国内网站均有对应分组；`🔞 NSFW` 默认使用 `REJECT` 拦截，仍可手动改为节点或 `DIRECT`；
- **最终兜底**：没有命中上述规则的流量交给 `🐟 漏网之鱼`。

`🛑 广告拦截` 与 `🔞 NSFW` 默认选择 `REJECT`；所有策略组均可由用户自行切换，不启用自动测速。若广告拦截影响个别应用的登录、播放、购买、通知或遥测，可临时把 `🛑 广告拦截` 改为 `DIRECT` 或其他策略。

## 精简版：同样的分流，10 个策略组

44 个策略组是为了能分别挑节点。用不到这种粒度的人，面对的就是一屏需要逐个确认的下拉框。精简版把这些合并掉：

| | 完整版 | 精简版 |
|---|---|---|
| 策略组 | 44 | 10 |
| 分流规则 | 57 段 | 同样 57 段 |

保留下来的 10 个是 `♻️ 手动切换`、`🌏 国内网站`、`🎬 流媒体`、`🧲 海外 AI`、`🎮 游戏平台`、`🎮 游戏下载`、`🚀 国外服务`、`🛑 广告拦截`、`🔞 NSFW` 和 `🐟 漏网之鱼`。

**行为没有变。** 精简不是删规则，而是把完整版的细分策略改指到合并后的策略组：原先各自成组、默认都走代理的那些——OpenAI、Claude、Adobe、各家流媒体、社交、开发服务、海外云、海外购物等——统一进 `🚀 国外服务` 或 `🎬 流媒体`；原先默认直连的国内分组统一进 `🌏 国内网站`。每一条规则该直连的仍然直连、该代理的仍然代理，命中顺序一条没动；测试会逐段比对两套产品的最终动作。

**代价是细粒度。** 完整版里可以只给 Netflix 换一个节点而不动 YouTube；精简版里它们同属 `🎬 流媒体`，换就是一起换。需要按服务分别挑线路，就用完整版。

在线站的「远程配置」下拉里，第一项是完整版，第二项是精简版。只要规则的取用地址见上一节。

## 中国大陆域名、IP 与 DNS

末尾路由顺序固定为：

```text
全部具体业务规则
→ 五个非微软 late-recovery ruleset
→ 海外云服务 → 国内云服务
→ 微软服务及其 late-recovery → Google
→ 海外购物
→ 大陆宽域根域
→ GEOIP,CN,DIRECT,no-resolve
→ MATCH,🐟 漏网之鱼
```

倒数第二层是九条大陆宽域根域——百度、腾讯、网易、小米各自的主域,以及 `gtimg.com`、`127.net` 两条 CDN 根。它们放在这里而不是更早,是因为顺序即语义:这些根域下面还住着云、流媒体和 AI 的具体主机,提前匹配会把那些抢走。它们与大陆域名层的其余部分一样出自本仓库自有证据(见 [`docs/PROVENANCE.md`](docs/PROVENANCE.md)),只使用锚定的 `DOMAIN` / `DOMAIN-SUFFIX`,不使用已弃用的 `GEOSITE`,也不使用 `DOMAIN-KEYWORD`、正则或单标签/公共后缀兜底,在不触发额外 DNS 查询的情况下把命中的域名交给 `🌏 国内网站`(默认 `DIRECT`)。覆盖面更大的那 4,266 条大陆域名规则位于更前面的具体业务规则之中。

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

- 公开规则与在线远程配置不保存代理节点或订阅凭据；本地自托管形态只在用户自己的 Docker 数据卷中保存固定 URL 所需的最少源地址映射；开放形态不保存订阅、节点或任何属于某个人的记录，只累加访问与拉取两组整数；
- 公开 Mihomo 模板不接管端口、DNS、TUN、控制器等客户端设置；本地自托管入口会生成可直接导入的完整配置；
- 公开规则产品维护规则、顺序、策略组和映射；自托管应用只负责在本机获取订阅并调用固定版本的转换引擎；
- `sources/` 是规则产品的唯一规范源，`generated/reversed-profile/` 只能由生成器重建；
- `selfhost/` 包含 Web 应用、转换引擎快照与 Docker Compose，有两种形态：`lan` 保存固定档案、只服务部署者自己；`public` 不保存任何东西、面向所有访问者。不存在把别人的订阅保存在公网服务器上的第三种形态。

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
