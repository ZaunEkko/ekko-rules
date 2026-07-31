# Ekko Rules

[English](README_EN.md)

面向 Subconverter 与 Mihomo 的可复用分流规则和订阅模板。

## 项目定位

Ekko Rules 采用与 ACL4SSR 在线预设相同的职责边界：

- 不保存用户节点、订阅凭据或代理服务器信息；
- 核心预设不接管 `proxies` 上方的端口、DNS、TUN 和控制器设置；
- 维护策略组、节点筛选逻辑、规则集、规则优先级及策略映射；
- 同时生成 Subconverter `.list` 和 Mihomo classical Rule Provider。

仓库内 `sources/` 是唯一规范源；`generated/reversed-profile/` 是确定性生成产物，不应手工修改。正常生成和验证不再依赖外部、含节点凭据的展开配置。

## 目录

```text
sources/
├── manifest.yaml              43 个有序规则区段
├── proxy-groups.yaml          42 个有序策略组
├── base.yaml                  可选脱敏基础配置
├── rules/*.list               42 个规范规则文件
├── upstreams.yaml             固定上游快照、许可证和证据哈希
├── quality-baseline.yaml      重复、CIDR 与首匹配覆盖门禁
└── review.yaml                不参与生成的观察项

scripts/
├── profile_model.py           规范模型、校验、渲染和行为分析
├── generate_profile.py        唯一正式生成入口
├── validate_generated.py      独立产物验证门禁
└── reverse_profile.py         仅用于迁移的 legacy importer

generated/reversed-profile/
├── config/                    Subconverter 预设
├── Ruleset/                   Subconverter 经典规则
├── Providers/Ruleset/         Mihomo classical Rule Providers
├── Mihomo/                    Mihomo 原生模板
├── base/                      可选 Clash 基础配置
├── analysis.json              当前规范源派生统计
└── manifest.json              产物文件清单和 SHA-256
```

## Subconverter 预设

| 文件 | 用途 | 是否接管基础配置 |
|---|---|---:|
| `config/ekko-rules.ini` | 推荐的核心在线预设 | 否 |
| `config/ekko-rules-full.ini` | 可选完整预设 | 是 |
| `config/ekko-rules-local.ini` | 本地 Subconverter 预设 | 默认否 |

用户订阅负责动态生成 `proxies`；`custom_proxy_group` 通过 `.*` 根据当前节点动态生成成员；端口、DNS、TUN 等由 Subconverter 服务端或客户端决定。

## 生成

要求 Python 3.12：

```bash
python -m pip install -r requirements.txt
python scripts/generate_profile.py
```

生成器先在目标同级空 staging 中渲染和自检，再替换正式目录；失败时保留旧目录。生成内容不含时间戳、随机值或本机绝对路径。

检查已提交产物是否最新，且不修改文件：

```bash
python scripts/generate_profile.py --check
```

## 验证与测试

```bash
python scripts/validate_generated.py
python -m unittest discover -s tests -v
```

门禁覆盖：

- source schema、42 组、43 段、两个非连续 music 区段和 FINAL 顺序；
- 三个 INI 的 target、slug、URL/本地路径、策略组成员和 base 开关；
- Mihomo Provider、`RULE-SET/MATCH`、策略组和订阅占位符；
- 42 对 `.list`/Provider payload 逐行同序一致；
- 文件集合闭合、SHA-256、两次生成幂等和旧文件检测；
- 所有目标 IP 规则带 `no-resolve`，CIDR strict 合法；
- exact 重复、首匹配覆盖质量基线和代表路由行为；
- 节点、凭据、UUID、token、真实订阅和绝对路径泄漏扫描。

## 当前规则状态

- 42 个规则文件、43 个有序区段、42 个策略组；
- 15,541 条规则（含 FINAL）；
- 2,205 条目标 IP 规则，全部带 `no-resolve`；
- 同区段 exact 重复为 0；
- 非 strict CIDR 为 0；
- 严格不可达并集从 bootstrap 的 2,734 降至 2,489。

详细变更和首匹配差异见 [`docs/CHANGES.md`](docs/CHANGES.md)。不确定、legacy、品牌防御和个人社区项保存在 `sources/review.yaml`，不会仅凭一次 NXDOMAIN、403、超时或 TLS 错误自动删除。

## Legacy importer

仅在迁移另一份展开配置时使用：

```bash
python scripts/reverse_profile.py expanded-profile.yaml candidate-sources
```

输出目录必须不存在。它只生成待人工审查的候选 `sources/`，不会覆盖正式 `generated/`，也无法恢复原始上游边界。候选源必须补齐 provenance 后再考虑发布。

## 私有仓库与发布门禁

仓库目前保持私有。GitHub Raw URL 已配置为 `ZaunEkko/ekko-rules` 的 `main` 分支，但外部 Subconverter/Mihomo 通常无法匿名读取私有 Raw 文件。

当前不授予统一再分发许可，也不会自动提交、推送、发布或改变仓库可见性。公开前必须完成：

- [`NOTICE.md`](NOTICE.md)
- [`docs/PROVENANCE.md`](docs/PROVENANCE.md)
- [`docs/PUBLICATION-GATE.md`](docs/PUBLICATION-GATE.md)

DNS/TUN 仍属于客户端职责；`no-resolve` 能阻止 IP 规则为匹配目标而主动解析域名，但不能替代 DNS 劫持、加密 DNS、`strict-route` 等客户端防泄漏配置。
