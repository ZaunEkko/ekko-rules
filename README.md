# Ekko Rules

[English](README_EN.md)

面向 Subconverter 与 Mihomo 的可复用分流规则和订阅模板。

## 项目定位

Ekko Rules 采用与 ACL4SSR 在线预设相同的职责边界：不保存节点或订阅凭据，不接管 `proxies` 上方的端口、DNS、TUN 和控制器设置，只维护策略组、规则集、顺序和策略映射。`sources/` 是唯一规范源，`generated/reversed-profile/` 只能由生成器重建。

## Core 与 Extended

| 产品 | Rulesets / Segments / Groups | 内容 | Base |
|---|---:|---|---:|
| Core | 51 / 52 / 44 | 默认服务规则；排除个人社区、legacy 和品牌防御 optional 层 | 否 |
| Core Full | 51 / 52 / 44 | Core + 仓库脱敏基础配置 | 是 |
| Extended | 57 / 58 / 45 | Core + Emby 社区、Spotify legacy、Qobuz 防御、社区和历史流媒体 | 否 |

Subconverter：

- `config/ekko-rules.ini`：Core 在线预设；
- `config/ekko-rules-full.ini`：Core + base；
- `config/ekko-rules-local.ini`：本地 Core；
- `config/ekko-rules-extended.ini`：Extended 在线预设；
- `config/ekko-rules-extended-local.ini`：本地 Extended。

Mihomo：

- `Mihomo/reversed-template.yaml`：Core；
- `Mihomo/reversed-template-extended.yaml`：Extended。

## 二期分类

- Messaging 拆为 LINE、Kakao、WhatsApp、Telegram，但继续共用 `📲 聊天软件`；
- 音乐拆为 Tidal、Spotify、Qobuz、Apple Music，并以非连续 optional 段保留 Extended 的原始首匹配顺序；
- 新增最小 `🧠 AI 服务`、`🗣 社交媒体`、`🧑‍💻 开发服务` 策略组；
- 路由器、本地探测和保留地址进入 `private`，直接指向 `DIRECT`；
- 共享 CDN/cloud/vendor 不再由 OpenAI、Claude、DAZN 或 global-media 前置专用策略独占；服务专属精确主机保留；
- Apple/Google brand-defense 和 legacy 的完整逐行拆分留给后续独立批次，目前不声称已完成。

Core 含 15,412 条规则，Extended 含 15,518 条规则，均含唯一 FINAL。两者都有 2,205 条目标 IP 规则，全部带 `no-resolve`。迁移闭合台账证明：旧 15,540 条文件规则 = Extended 15,517 + 23 条明确删除；Extended = Core 15,411 + 106 条 optional。删除项只来自共享误绑、覆盖重复、过宽 keyword 或一期已确认 stale 项，不依赖单次网络失败。

## 生成与验证

要求 Python 3.12：

```bash
python -m pip install -r requirements.txt
python scripts/generate_profile.py
python scripts/generate_profile.py --check
python scripts/validate_generated.py
python -m unittest discover -s tests -v
```

生成器使用同盘 staging 和原子目录替换；失败保留旧输出。门禁检查 Core/Extended 顺序、唯一 FINAL、Provider、SHA-256、敏感信息、strict CIDR、`no-resolve`、迁移前后首匹配和迁移闭合。

## 私有仓库与发布门禁

仓库保持 Private。外部客户端通常不能匿名读取 Private GitHub Raw。当前不授予统一再分发许可，也不会自动提交、推送、发布或改变可见性。公开前必须完成人工来源和许可证审查：[`NOTICE.md`](NOTICE.md)、[`docs/PROVENANCE.md`](docs/PROVENANCE.md)、[`docs/PUBLICATION-GATE.md`](docs/PUBLICATION-GATE.md)。

DNS/TUN 仍属于客户端职责；`no-resolve` 不能替代 DNS 劫持、加密 DNS 或 `strict-route`。
