## 变更说明

<!-- 说明修改了哪些规则、顺序、策略组或文档，以及为什么。 -->

## 证据与影响

- 相关服务/域名：
- 公开来源或许可证：
- 当前行为：
- 预期行为：
- 是否改变首匹配、默认策略或策略组顺序：

## 检查清单

- [ ] 我只修改了 `sources/` 等规范源，没有手工编辑生成规则；`generated/reversed-profile/` 由正式生成器重建。
- [ ] 域名规则使用尽可能精确的 `DOMAIN` / `DOMAIN-SUFFIX`，没有引入未经论证的宽泛关键词或共享基础设施根域。
- [ ] 所有目标 IP 规则使用 strict CIDR（如适用）并带 `no-resolve`。
- [ ] 我没有提交真实订阅 URL、token、UUID、密码、私钥、节点服务器/端口或完整客户端配置。
- [ ] 我已记录新增外部数据的固定版本、许可证和来源（如适用）。
- [ ] 我已同步 README、变更日志、测试和质量基线（如适用）。
- [ ] 我已运行：
  - [ ] `python scripts/generate_profile.py`
  - [ ] `python scripts/validate_generated.py`
  - [ ] `python scripts/generate_profile.py --check`
  - [ ] `python -m unittest discover -s tests -v`
  - [ ] `git diff --check`
