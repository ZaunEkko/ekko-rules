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

在“远程配置”输入框中粘贴完整地址后，下拉列表会出现一条相同的完整 URL。**必须点击这条 URL 候选项完成选择**，不能只粘贴或只按 Enter；成功后输入框会变回只读状态并完整显示该 URL。确认不再显示“默认”后，再点击“生成订阅链接”。**不要只看输入框中是否有空格，必须检查最终生成的定制订阅地址**：有些前端会在提交时自动在远程配置前插入空格。正确结果应包含 `config=https%3A%2F%2Fraw.githubusercontent.com%2FZaunEkko%2Fekko-rules%2F...%2Fekko-rules.ini`，`config=` 后立即是 `https`；如果出现 `config=%20https...`，其中 `%20` 就是前导空格。此时应删除远程配置、重新粘贴并点击完整 URL 候选，再生成并复查，直到 `%20` 消失。若缺少 `config=` 或仍为 `config=%20https...`，转换器可能读取失败并回退到网站默认预设，而不是 Ekko Rules 的 36 个策略组。

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

## 重点分流

Ekko Rules 主要面向需要单独选择节点或地区的场景：

- **AI 分流**：OpenAI、Claude 独立分组；Gemini、Grok、Microsoft AI、Cursor、Hugging Face、Perplexity、Poe、OpenRouter、Mistral、Groq 等统一归入 `🧲 海外 AI`；
- **主流流媒体**：YouTube、Netflix、Disney+、Apple TV+、`🎬 HBO GO/MAX`、Prime Video、DAZN、TikTok 等重点服务单独处理；HBO GO 与 Max 共用一组，DAZN 保持独立；
- **区域媒体**：美国长尾统一归入 `🎬 美国流媒体`，港澳台、B站港澳台、东南亚、日本、韩国、爱奇艺和国内流媒体分别处理；
- **游戏分流**：`🎮 游戏平台` 与 `🎮 游戏下载` 分开，方便平台访问和大流量下载选择不同线路；
- **社交与通信**：社交媒体、聊天软件、Discord、邮件和开发服务分别处理；
- **其他重点流量**：音乐平台、云盘、Microsoft、Apple、Google、NSFW 和国内网站均有对应分组；
- **最终兜底**：没有命中上述规则的流量交给 `🐟 漏网之鱼`。

所有策略组都由用户手动选择节点，不启用自动测速。

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
