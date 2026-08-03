# Contributing to Ekko Rules

感谢你帮助完善规则。Ekko Rules 只维护规则、首匹配顺序、策略组以及规则到策略组的映射；节点、订阅商、DNS、TUN、端口、控制器和系统代理不属于本仓库范围。

## 最适合的反馈入口

- **新增域名或服务**：使用“➕ 域名或服务规则建议”Issue Form。
- **策略组、默认项或映射调整**：使用“🧭 策略组或映射调整”Issue Form。
- **域名、目标 IP 或进程误分类**：使用“🐛 误分类或规则问题”Issue Form。

请先搜索现有 Issue 和 `sources/rules/`，避免重复建议。

## 规则建议要求

1. 一行一个域名，并说明服务、功能和期望策略组。
2. 提供官方文档、官网或其他可公开核验的证据。
3. 优先使用锚定 `DOMAIN` / `DOMAIN-SUFFIX`；不要仅因名称相似就建议宽泛 `DOMAIN-KEYWORD`。
4. 不要把公共后缀、共享 CDN、云平台根域或可能影响其他租户的基础设施直接归入专用组。
5. 目标 IP 规则必须使用 strict CIDR，并始终带 `no-resolve`。
6. 规则具有 first-match 语义；误分类报告应同时说明实际命中、期望命中和疑似规则。
7. 批量或外部数据导入必须给出固定版本、来源、许可证和可重复的筛选边界。

## 安全与隐私

Issue、PR、日志和截图中不得出现：

- 真实订阅 URL 或 token；
- 节点服务器、端口、密码、UUID、私钥或证书；
- 完整 Clash/Mihomo 客户端配置；
- 可识别个人或订阅商账户的信息。

若已经公开凭据，请立即在服务端吊销或轮换。编辑或删除 GitHub 内容不能让已泄露凭据重新安全。

## 让 coding agent 帮你整理 Issue

可以让你的 coding agent 读取本文件与对应 Issue Form 后，代为整理或提交反馈。例如：

```text
请阅读 https://github.com/ZaunEkko/ekko-rules/blob/main/CONTRIBUTING.md，
再根据仓库的 Issue Form 帮我整理一份“域名或服务规则建议”。
只使用公开域名和公开证据；不要读取、复制或提交我的订阅 URL、token、
节点地址、端口、密码、UUID、私钥或完整客户端配置。提交前先让我确认正文。
```

建议让 agent **提交前先展示最终正文供你确认**。任何自动提交都不应绕过敏感信息检查。

## 修改代码

规范源位于：

- `sources/rules/*.list`：规则内容；
- `sources/manifest.yaml`：ruleset 顺序与 target；
- `sources/proxy-groups.yaml`：策略组顺序、成员与默认首选项；
- `sources/quality-baseline.yaml`：当前质量指标。

不要手工修改 `generated/reversed-profile/`。修改规范源后运行正式生成器：

```bash
python scripts/generate_profile.py
python scripts/validate_generated.py
python scripts/generate_profile.py --check
python -m unittest discover -s tests -v
git diff --check
```

PR 应同步必要的测试、质量基线、README、`docs/CHANGES.md` 与来源说明。生成产物必须与规范源一并提交。
