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

## 重点分流

Ekko Rules 主要面向需要单独选择节点或地区的场景：

- **AI 分流**：OpenAI、Claude 独立分组；Gemini、Grok、Microsoft AI、Cursor、Hugging Face、Perplexity、Poe、OpenRouter、Mistral、Groq 等统一归入 `🌐 海外 AI`；
- **主流流媒体**：YouTube、Netflix、Disney+、Apple TV+、Max、HBO GO、Prime Video、DAZN、TikTok 等重点服务独立分组；
- **区域媒体**：美国长尾、港澳台、B站港澳台、东南亚、日本、韩国、爱奇艺和国内流媒体分别处理；
- **游戏分流**：`🎮 游戏平台` 与 `🎮 游戏下载` 分开，方便平台访问和大流量下载选择不同线路；
- **社交与通信**：社交媒体、聊天软件、Discord、邮件和开发服务分别处理；
- **其他重点流量**：音乐平台、云盘、Microsoft、Apple、Google、NSFW 和国内网站均有对应分组；
- **最终兜底**：没有命中上述规则的流量交给 `🐟 漏网之鱼`。

所有策略组都由用户手动选择节点，不启用自动测速。

## 中国 IP 与 DNS 取舍

默认生成的完整 Clash 规则是：

```text
GEOIP,CN,DIRECT,no-resolve
```

- `DIRECT`：命中的中国大陆 IP 直接连接；
- `no-resolve`：GEOIP 规则不会为了判断域名而额外发起 DNS 查询，可降低这一步产生 DNS 泄露的风险；
- 代价是部分域名请求可能无法通过 GEOIP 规则识别为国内网站，继续走后续分流，个别国内网站可能绕远或访问变慢；
- 如果你对这类 DNS 泄露风险不敏感、希望更多国内域名在解析后命中中国 IP，可以在自己的配置中删除 `no-resolve`，改为 `GEOIP,CN,DIRECT`。

删除 `no-resolve` 后，GEOIP 匹配可能主动解析域名，查询会交给客户端当前使用的 DNS。是否实际泄露取决于客户端的 DNS、TUN、路由和加密 DNS 配置。Ekko Rules 默认保留 `no-resolve`，不提供另一套变体。

## 路由安全

- 所有目标 IP 规则默认带 `no-resolve`；
- 所有默认直连的域名规则禁止宽泛 `DOMAIN-KEYWORD`，避免仿冒域名被错误直连；
- 当前细分规则和中国 GEOIP 位于最终兜底之前；
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
