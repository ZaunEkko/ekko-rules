from __future__ import annotations

import argparse
import atexit
import json
import os
import re
import shutil
import sys
import tempfile
from collections import Counter, defaultdict
from ipaddress import ip_network
from pathlib import Path
from typing import Any

import yaml

from profile_model import (
    CORE_PRODUCT,
    EXTENDED_PRODUCT,
    ProfileError,
    ProfileSources,
    ProxyGroup,
    Segment,
    coverage_metrics,
    load_profile_sources,
    parse_yaml_document,
    scope_metrics,
)


FINAL_TARGET = "🐟 漏网之鱼"
NODE_PLACEHOLDER = "__ALL_SUBSCRIPTION_NODES__"
DESTINATION_IP_RULE_TYPES = {
    "IP-CIDR",
    "IP-CIDR6",
    "IP-SUFFIX",
    "IP-ASN",
    "GEOIP",
}
SENSITIVE_KEYS = {
    "password",
    "private-key",
    "public-key",
    "psk",
    "secret",
    "server",
    "short-id",
    "token",
    "url",
    "uuid",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Legacy importer: reverse an expanded Clash/Mihomo profile into a "
            "candidate canonical sources directory for manual review."
        )
    )
    parser.add_argument("source", type=Path, help="Expanded Clash/Mihomo YAML profile")
    parser.add_argument(
        "output",
        type=Path,
        help="New candidate sources directory; it must not already exist",
    )
    return parser.parse_args()


def rule_target(rule: str) -> str:
    parts = [part.strip() for part in rule.split(",")]
    return parts[-2] if parts[-1] == "no-resolve" else parts[-1]


def rule_matcher(rule: str) -> str:
    parts = [part.strip() for part in rule.split(",")]
    return ",".join(parts[:-2] if parts[-1] == "no-resolve" else parts[:-1])


def rule_provider_entry(rule: str) -> str:
    parts = [part.strip() for part in rule.split(",")]
    has_no_resolve = parts[-1] == "no-resolve"
    entry = parts[:-2] if has_no_resolve else parts[:-1]
    if entry[0] in DESTINATION_IP_RULE_TYPES:
        return ",".join(entry + ["no-resolve"])
    if has_no_resolve:
        return ",".join(entry + ["no-resolve"])
    return ",".join(entry)


def slugify(name: str) -> str:
    aliases = {
        "DIRECT": "direct-override",
        "🧲 OpenAI": "openai",
        "🧲 Claude": "claude",
        "🌐 海外 AI": "ai-platforms",
        "🔖 OneDrive": "onedrive",
        "☁️ 云盘服务": "cloud-storage",
        "🎙 Discord": "discord",
        "📲 Instagram": "instagram",
        "📪 邮件服务": "mail",
        "📲 聊天软件": "messaging",
        "🎮 游戏下载": "game-download",
        "🎮 游戏平台": "game-platform",
        "🎬 韩国媒体": "media-korea",
        "🎬 台湾媒体": "media-taiwan",
        "🎬 港澳台媒体": "media-hmt",
        "🎬 东南亚媒体": "media-southeast-asia",
        "🇺🇸 美国流媒体": "us-media",
        "🔞 NSFW": "nsfw",
        "🎬 PrimeVideo": "prime-video",
        "🎬 viuTV": "viutv",
        "🎬 KKTV": "kktv",
        "🎬 巴哈姆特": "bahamut",
        "🎬 日本媒体": "media-japan",
        "🎬 YouTube": "youtube",
        "🎵 音乐平台": "music",
        "🎬 DisneyPlus": "disney-plus",
        "🎬 HBOGO": "hbo-go",
        "🎬 HBOMAX": "hbo-max",
        "🎬 EMBY": "emby",
        "🎬 Dazn": "dazn",
        "🎬 AppleTV+": "apple-tv-plus",
        "🎬 B站东南亚": "bilibili-sea",
        "🎬 B站港澳台": "bilibili-hmt",
        "🎬 爱奇艺": "iqiyi",
        "🎶 TikTok": "tiktok",
        "🎬 Netflix": "netflix",
        "☁️ iCloud": "icloud",
        "🔎 Bing": "bing",
        "🧩 微软服务": "microsoft",
        "🍎 苹果服务": "apple",
        "🌏 国外流媒体": "global-media",
        "🔎 Google": "google",
        "🔎 Yahoo": "yahoo",
        "🌏 学术网站": "academic",
        "🌏 国外网站": "global-web",
        "🌏 国内流媒体": "china-media",
        "🌏 国内网站": "china-web",
        FINAL_TARGET: "final",
    }
    if name in aliases:
        return aliases[name]
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or "rules"


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content.rstrip() + "\n", encoding="utf-8", newline="\n")


def build_segments(rules: list[str]) -> list[dict[str, Any]]:
    segments: list[dict[str, Any]] = []
    slug_counts: Counter[str] = Counter()
    for index, rule in enumerate(rules, start=1):
        target = rule_target(rule)
        if not segments or segments[-1]["target"] != target:
            base_slug = slugify(target)
            slug_counts[base_slug] += 1
            suffix = f"-{slug_counts[base_slug]}" if slug_counts[base_slug] > 1 else ""
            segments.append(
                {
                    "index": len(segments) + 1,
                    "start": index,
                    "end": index,
                    "target": target,
                    "slug": f"{base_slug}{suffix}",
                    "rules": [rule],
                }
            )
        else:
            segments[-1]["end"] = index
            segments[-1]["rules"].append(rule)
    return segments


def normalized_groups(
    groups: list[dict[str, Any]], node_names: set[str]
) -> list[dict[str, Any]]:
    normalized = []
    for group in groups:
        members = group.get("proxies") or []
        group_nodes = [member for member in members if member in node_names]
        if set(group_nodes) != node_names or len(group_nodes) != len(node_names):
            raise ValueError(
                f"Proxy group {group.get('name')} does not contain every expanded node exactly once"
            )
        mapped = [
            NODE_PLACEHOLDER if member in node_names else member
            for member in members
        ]
        collapsed = []
        for member in mapped:
            if member == NODE_PLACEHOLDER and member in collapsed:
                continue
            collapsed.append(member)
        if collapsed[-1] != NODE_PLACEHOLDER:
            raise ValueError(
                f"Proxy group {group.get('name')} does not place expanded nodes last"
            )
        normalized.append({**group, "proxies": collapsed})
    return normalized


def write_rulesets(output: Path, segments: list[dict[str, Any]]) -> None:
    for segment in segments:
        if segment["target"] == FINAL_TARGET:
            continue
        entries = [rule_provider_entry(rule) for rule in segment["rules"]]
        write_text(output / "Ruleset" / f"{segment['slug']}.list", "\n".join(entries))
        write_text(
            output / "Providers" / "Ruleset" / f"{segment['slug']}.yaml",
            yaml.safe_dump(
                {"payload": entries},
                allow_unicode=True,
                sort_keys=False,
                width=1000,
            ),
        )


def ini_group_line(group: dict[str, Any]) -> str:
    members = group.get("proxies") or []
    tokens = [
        ".*" if member == NODE_PLACEHOLDER else f"[]{member}" for member in members
    ]
    return "`".join(
        [f"custom_proxy_group={group['name']}", group.get("type", "select")]
        + tokens
    )


def write_subconverter(
    output: Path,
    groups: list[dict[str, Any]],
    segments: list[dict[str, Any]],
    rules_base_url: str,
    base_config_url: str,
) -> None:
    group_lines = [ini_group_line(group) for group in groups]
    footer = [
        "",
        "enable_rule_generator=true",
        "overwrite_original_rules=true",
        "",
        *group_lines,
        "",
        "# Source profile contained no automatic test group; this preserves that behavior.",
        "# Optional modern addition:",
        "# custom_proxy_group=⚡ 自动选择`url-test`.*`https://www.gstatic.com/generate_204`300,,50",
    ]

    core = [
        "[custom]",
        "",
        "# Core preset: ports, DNS, TUN and other fields above proxies are",
        "# supplied by the Subconverter server or client, like ACL4SSR online presets.",
        f";clash_rule_base={base_config_url}",
    ]
    full = ["[custom]", "", f"clash_rule_base={base_config_url}"]
    local = ["[custom]", "", ";clash_rule_base=base/GeneralClashConfig.yml"]
    for segment in segments:
        target = segment["target"]
        if target == FINAL_TARGET:
            rule_line = f"ruleset={target},[]FINAL"
            core.append(rule_line)
            full.append(rule_line)
            local.append(rule_line)
        else:
            online_rule = (
                f"ruleset={target},{rules_base_url.rstrip('/')}/{segment['slug']}.list"
            )
            core.append(online_rule)
            full.append(online_rule)
            local.append(f"ruleset={target},Ruleset/{segment['slug']}.list")
    core.extend(footer)
    full.extend(footer)
    local.extend(footer)
    write_text(output / "config" / "ekko-rules.ini", "\n".join(core))
    write_text(output / "config" / "ekko-rules-full.ini", "\n".join(full))
    write_text(output / "config" / "ekko-rules-local.ini", "\n".join(local))


def write_mihomo(
    output: Path,
    source: dict[str, Any],
    groups: list[dict[str, Any]],
    segments: list[dict[str, Any]],
    providers_base_url: str,
) -> None:
    rule_providers: dict[str, Any] = {}
    rules = []
    for segment in segments:
        target = segment["target"]
        if target == FINAL_TARGET:
            rules.append(f"MATCH,{target}")
            continue
        provider_name = segment["slug"]
        rule_providers[provider_name] = {
            "type": "http",
            "behavior": "classical",
            "format": "yaml",
            "url": f"{providers_base_url.rstrip('/')}/{provider_name}.yaml",
            "path": f"./ruleset/{provider_name}.yaml",
            "interval": 86400,
        }
        rules.append(f"RULE-SET,{provider_name},{target}")

    mihomo_groups = []
    for group in groups:
        members = group.get("proxies") or []
        rebuilt: dict[str, Any] = {
            key: value for key, value in group.items() if key != "proxies"
        }
        rebuilt["proxies"] = [member for member in members if member != NODE_PLACEHOLDER]
        rebuilt["use"] = ["subscription"]
        mihomo_groups.append(rebuilt)

    base_keys = ["mixed-port", "allow-lan", "mode", "log-level", "external-controller"]
    config = {key: source[key] for key in base_keys if key in source}
    config.update(
        {
            "proxy-providers": {
                "subscription": {
                    "type": "http",
                    "url": "PUT_YOUR_SUBSCRIPTION_URL_HERE",
                    "path": "./proxy_provider/subscription.yaml",
                    "interval": 3600,
                    "health-check": {
                        "enable": True,
                        "url": "https://www.gstatic.com/generate_204",
                        "interval": 300,
                    },
                }
            },
            "proxy-groups": mihomo_groups,
            "rule-providers": rule_providers,
            "rules": rules,
        }
    )
    write_text(
        output / "Mihomo" / "reversed-template.yaml",
        yaml.safe_dump(config, allow_unicode=True, sort_keys=False, width=1000),
    )


def contains_sensitive_mapping(data: Any) -> bool:
    if isinstance(data, dict):
        return any(
            str(key).lower() in SENSITIVE_KEYS or contains_sensitive_mapping(value)
            for key, value in data.items()
        )
    if isinstance(data, list):
        return any(contains_sensitive_mapping(value) for value in data)
    return False


def write_base_config(output: Path, source: dict[str, Any]) -> None:
    base_keys = [
        "mixed-port",
        "allow-lan",
        "mode",
        "log-level",
        "external-controller",
    ]
    base = {key: source[key] for key in base_keys if key in source}
    base.update({"proxies": [], "proxy-groups": [], "rules": []})
    write_text(
        output / "base" / "GeneralClashConfig.yml",
        yaml.safe_dump(base, allow_unicode=True, sort_keys=False, width=1000),
    )


def write_analysis(
    output: Path,
    source: dict[str, Any],
    groups: list[dict[str, Any]],
    segments: list[dict[str, Any]],
    rules: list[str],
) -> None:
    target_types: dict[str, Counter[str]] = defaultdict(Counter)
    matcher_targets: dict[str, set[str]] = defaultdict(set)
    exact_counts = Counter(rules)
    for rule in rules:
        target = rule_target(rule)
        target_types[target][rule.split(",", 1)[0]] += 1
        matcher_targets[rule_matcher(rule)].add(target)

    report = {
        "source_summary": {
            "proxy_count": len(source.get("proxies") or []),
            "proxy_types": dict(Counter(p.get("type", "unknown") for p in source.get("proxies") or [])),
            "proxy_group_count": len(groups),
            "rule_count": len(rules),
            "rule_provider_count": len(source.get("rule-providers") or {}),
        },
        "inferences": {
            "confirmed": [
                "The source is a fully expanded Clash/Mihomo profile.",
                "All proxy groups are select groups.",
                "Every group contains all subscription nodes; groups differ only in named references and ordering.",
                "Rules are inline and ordered; no rule-providers exist in the source.",
                "The final rule is MATCH to the final policy group.",
            ],
            "inferred": [
                "The original converter most likely used `.*` for each group's node filter.",
                "Specific source repositories and original ruleset file boundaries cannot be recovered from the expanded profile.",
                "Contiguous target segments are used as reconstructed ruleset boundaries to preserve behavior.",
            ],
        },
        "quality": {
            "exact_duplicate_occurrences_beyond_first": sum(
                count - 1 for count in exact_counts.values() if count > 1
            ),
            "exact_duplicate_rule_keys": sum(1 for count in exact_counts.values() if count > 1),
            "matchers_routed_to_multiple_targets": sum(
                1 for targets in matcher_targets.values() if len(targets) > 1
            ),
            "note": "Duplicates and overlaps are retained because first-match ordering is behaviorally significant.",
        },
        "segments": [
            {
                "index": segment["index"],
                "start": segment["start"],
                "end": segment["end"],
                "count": len(segment["rules"]),
                "target": segment["target"],
                "slug": segment["slug"],
                "rule_types": dict(target_types[segment["target"]]),
            }
            for segment in segments
        ],
        "security": {
            "source_had_sensitive_proxy_data": contains_sensitive_mapping(
                source.get("proxies") or []
            ),
            "sensitive_proxy_data_written": False,
        },
    }
    write_text(
        output / "analysis.json",
        json.dumps(report, ensure_ascii=False, indent=2),
    )


def write_readme(output: Path, rules_base_url: str) -> None:
    chinese = f"""# Ekko Rules

[English](README_EN.md)

面向 Subconverter 与 Mihomo 的可复用分流规则和订阅模板。本目录由脱敏后的展开配置反推生成，不包含代理服务器、端口、密码、UUID、密钥或原始订阅地址。

## 产物

- `config/ekko-rules.ini`：核心在线预设，不覆盖 Subconverter 服务端的 Clash 基础配置。
- `config/ekko-rules-full.ini`：可选完整版，使用仓库提供的基础配置。
- `config/ekko-rules-local.ini`：本地核心预设，可选本地基础配置默认处于注释状态。
- `base/GeneralClashConfig.yml`：可选且已脱敏的 Clash 基础配置。
- `Ruleset/*.list`：供 Subconverter 使用的经典规则集，按原始连续规则区段拆分。
- `Providers/Ruleset/*.yaml`：供 Mihomo 使用的 classical Rule Provider。
- `Mihomo/reversed-template.yaml`：使用代理提供器占位地址的 Mihomo 原生模板。
- `analysis.json`：脱敏后的反推依据与质量统计。

## Subconverter 用法

1. 发布本目录，使 `Ruleset` 可通过 `{rules_base_url}` 访问。
2. 核心用法选择 `config/ekko-rules.ini`。与 ACL4SSR 在线预设类似，`proxies` 上方的端口、DNS、TUN、控制器等配置由 Subconverter 服务端或客户端决定。
3. 只有需要仓库提供的固定 Clash 基础配置时，才使用 `config/ekko-rules-full.ini`。
4. 当前仓库为私有仓库时，外部 Subconverter 无法匿名读取 GitHub Raw 地址；公开仓库后这些地址才可直接使用。

## Mihomo 用法

1. 将 `Mihomo/reversed-template.yaml` 中的 `PUT_YOUR_SUBSCRIPTION_URL_HERE` 替换为自己的订阅地址。
2. 确保 `Providers/Ruleset` 已发布，并可由 Mihomo 访问。
3. 在兼容 Mihomo 的客户端中加载模板。

## 行为说明

- `ruleset=` 和 `RULE-SET` 的顺序与原配置一致。
- 所有目标 IP 规则（如 `IP-CIDR`、`IP-CIDR6`、`GEOIP`、`IP-ASN`）统一带 `no-resolve`，避免规则匹配主动触发 DNS 解析。
- 同一策略目标可对应多个非连续区段；候选文件按导入时的连续段和顺序保留。
- 精确重复规则和跨策略重叠暂时保留；在未完成优先级分析前去重可能改变首条命中行为。
- 原配置没有自动测速组，生成的 Subconverter 预设只保留了一条注释示例。
- 核心预设不管理 `proxies` 上方的端口、DNS、TUN、控制器等客户端配置。
- 原配置中的机场专属 DNS/Hosts 设置未复制到通用模板。
"""
    english = f"""# Ekko Rules

[中文](README.md)

Reusable routing rules and subscription templates for Subconverter and Mihomo. This directory is reconstructed from a sanitized expanded profile and contains no proxy servers, ports, passwords, UUIDs, keys, or source subscription URLs.

## Outputs

- `config/ekko-rules.ini`: Core online preset; it does not override the Subconverter server's Clash base.
- `config/ekko-rules-full.ini`: Optional full preset using the included Clash base.
- `config/ekko-rules-local.ini`: Local core preset; the optional local base remains commented out.
- `base/GeneralClashConfig.yml`: Optional sanitized Clash base configuration.
- `Ruleset/*.list`: Classical rules for Subconverter, split by original contiguous segments.
- `Providers/Ruleset/*.yaml`: Classical Rule Providers for Mihomo.
- `Mihomo/reversed-template.yaml`: Native Mihomo template with a proxy-provider URL placeholder.
- `analysis.json`: Sanitized reconstruction evidence and quality statistics.

## Subconverter

1. Publish this directory so `Ruleset` is reachable at `{rules_base_url}`.
2. Use `config/ekko-rules.ini` for the ACL4SSR-style core preset. Ports, DNS, TUN, controller settings, and other fields above `proxies` come from the Subconverter server or client.
3. Use `config/ekko-rules-full.ini` only when the repository-provided Clash base is wanted.
4. External Subconverter services cannot anonymously fetch GitHub Raw files while the repository is private. The URLs become directly usable after the repository is public.

## Mihomo

1. Replace `PUT_YOUR_SUBSCRIPTION_URL_HERE` in `Mihomo/reversed-template.yaml`.
2. Ensure `Providers/Ruleset` is published and reachable by Mihomo.
3. Load the template in a Mihomo-compatible client.

## Behavior notes

- Ordered `ruleset=` and `RULE-SET` entries preserve source rule precedence.
- Every destination-IP rule (including `IP-CIDR`, `IP-CIDR6`, `GEOIP`, and `IP-ASN`) carries `no-resolve` so rule matching does not trigger DNS resolution.
- One policy target may have multiple non-contiguous segments; candidate files preserve imported contiguous segments and order.
- Exact duplicates and cross-policy overlaps remain because removing them without precedence analysis may change first-match behavior.
- The source profile had no automatic latency group; only a commented example is included.
- The core preset intentionally does not manage ports, DNS, TUN, controller settings, or other fields above `proxies`.
- Provider-specific DNS and Hosts customizations from the source are not copied.
"""
    write_text(output / "README.md", chinese)
    write_text(output / "README_EN.md", english)


def main() -> None:
    args = parse_args()
    source = parse_yaml_document(
        args.source.read_text(encoding="utf-8"), context=str(args.source)
    )
    if not isinstance(source, dict):
        raise ValueError("Expanded profile must contain a YAML mapping")
    proxies = source.get("proxies") or []
    groups = source.get("proxy-groups") or []
    rules = [str(rule) for rule in source.get("rules") or []]
    node_names = {proxy.get("name") for proxy in proxies}

    final_output = args.output.resolve()
    if final_output.exists():
        raise FileExistsError(f"Candidate output already exists: {final_output}")
    if not proxies or len(node_names) != len(proxies) or None in node_names:
        raise ValueError("Expanded profile must contain uniquely named inline proxy nodes")
    if not rules:
        raise ValueError("Expanded profile must contain ordered inline rules")
    final_parts = [part.strip() for part in rules[-1].split(",")]
    if final_parts != ["MATCH", FINAL_TARGET]:
        raise ValueError("Expanded profile must end with exactly MATCH to the FINAL target")
    if any(rule_target(rule) == FINAL_TARGET for rule in rules[:-1]):
        raise ValueError("FINAL target may only appear in the final MATCH rule")
    if set(source) & {"proxy-providers"}:
        raise ValueError("Legacy importer only supports expanded inline proxy nodes")

    normalized = normalized_groups(groups, node_names)
    segments = build_segments(rules)

    final_output.parent.mkdir(parents=True, exist_ok=True)
    temporary_root = Path(
        tempfile.mkdtemp(prefix=f".{final_output.name}.stage-", dir=final_output.parent)
    )

    def cleanup_staging() -> None:
        shutil.rmtree(temporary_root, ignore_errors=True)

    atexit.register(cleanup_staging)
    args.output = temporary_root / final_output.name
    args.output.mkdir()
    rules_dir = args.output / "rules"
    rules_dir.mkdir()
    manifest_segments = []
    duplicate_by_slug: dict[str, int] = {}
    non_strict_cidrs: list[dict[str, str]] = []
    for segment in segments:
        if segment["target"] == FINAL_TARGET:
            manifest_segments.append(
                {
                    "order": segment["index"],
                    "kind": "terminal",
                    "slug": "final",
                    "target": FINAL_TARGET,
                    "matcher": "MATCH",
                    "scope": "core",
                }
            )
            continue

        entries = [rule_provider_entry(rule) for rule in segment["rules"]]
        slug = segment["slug"]
        write_text(rules_dir / f"{slug}.list", "\n".join(entries))
        counts = Counter(entries)
        duplicate_count = sum(count - 1 for count in counts.values() if count > 1)
        if duplicate_count:
            duplicate_by_slug[slug] = duplicate_count
        for entry in entries:
            parts = entry.split(",")
            if parts[0] in {"IP-CIDR", "IP-CIDR6"}:
                try:
                    ip_network(parts[1], strict=True)
                except ValueError:
                    non_strict_cidrs.append({"slug": slug, "rule": entry})
        manifest_segments.append(
            {
                "order": segment["index"],
                "kind": "ruleset",
                "slug": slug,
                "target": segment["target"],
                "source": f"rules/{slug}.list",
                "scope": "core",
            }
        )

    canonical_groups = []
    for order, group in enumerate(normalized, start=1):
        unsupported = set(group) - {"name", "type", "proxies"}
        if unsupported:
            raise ValueError(
                f"Proxy group {group.get('name')} has unsupported fields: {sorted(unsupported)}"
            )
        canonical_groups.append(
            {
                "order": order,
                "name": group["name"],
                "type": group.get("type", "select"),
                "scope": "core",
                "members": group.get("proxies") or [],
            }
        )

    manifest = {
        "schema_version": 1,
        "profile": {
            "id": "reversed-profile",
            "repository": "ZaunEkko/ekko-rules",
            "branch": "main",
            "generated_root": "generated/reversed-profile",
        },
        "urls": {
            "rules_base": "https://raw.githubusercontent.com/ZaunEkko/ekko-rules/main/generated/reversed-profile/Ruleset",
            "providers_base": "https://raw.githubusercontent.com/ZaunEkko/ekko-rules/main/generated/reversed-profile/Providers/Ruleset",
            "base_config": "https://raw.githubusercontent.com/ZaunEkko/ekko-rules/main/generated/reversed-profile/base/GeneralClashConfig.yml",
        },
        "rule_provider": {
            "type": "http",
            "behavior": "classical",
            "format": "yaml",
            "interval": 86400,
            "path_template": "./ruleset/{slug}.yaml",
        },
        "segments": manifest_segments,
    }
    proxy_groups = {
        "schema_version": 1,
        "node_placeholder": NODE_PLACEHOLDER,
        "proxy_provider": {
            "name": "subscription",
            "type": "http",
            "url": "PUT_YOUR_SUBSCRIPTION_URL_HERE",
            "path": "./proxy_provider/subscription.yaml",
            "interval": 3600,
            "health_check": {
                "enable": True,
                "url": "https://www.gstatic.com/generate_204",
                "interval": 300,
            },
            "subconverter_filter": ".*",
        },
        "groups": canonical_groups,
    }
    base_keys = [
        "mixed-port",
        "allow-lan",
        "mode",
        "log-level",
        "external-controller",
    ]
    base = {key: source[key] for key in base_keys if key in source}
    base.update({"proxies": [], "proxy-groups": [], "rules": []})
    rule_entries = [
        entry
        for segment in manifest_segments
        if segment["kind"] == "ruleset"
        for entry in (rules_dir / f"{segment['slug']}.list").read_text(encoding="utf-8").splitlines()
    ]
    destination_entries = [
        entry
        for entry in rule_entries
        if entry.split(",", 1)[0] in DESTINATION_IP_RULE_TYPES
    ]
    imported_scope = {
        "rule_files": len(manifest_segments) - 1,
        "rule_segments": len(manifest_segments) - 1,
        "terminal_segments": 1,
        "proxy_groups": len(canonical_groups),
        "rules_in_files": len(rule_entries),
        "rules_with_terminal": len(rule_entries) + 1,
        "destination_ip_rules": len(destination_entries),
        "destination_ip_rules_without_no_resolve": sum(
            not entry.endswith(",no-resolve") for entry in destination_entries
        ),
    }
    empty_coverage = {
        "global": {
            "exact_occurrences": 0,
            "broad_coverage_occurrences": 0,
            "overlap_between_categories": 0,
            "union": 0,
        },
        "within_same_segment": {
            "exact_occurrences": 0,
            "broad_coverage_occurrences": 0,
            "overlap_between_categories": 0,
            "union": 0,
        },
        "cross_segment_only": {"union": 0},
    }
    quality = {
        "schema_version": 1,
        "phase": "legacy-import-candidate",
        "measured_on": None,
        "products": {
            product: {
                "scope": dict(imported_scope),
                "first_match_unreachable": dict(empty_coverage),
            }
            for product in (CORE_PRODUCT, EXTENDED_PRODUCT)
        },
        "exact_duplicates_within_segment": {
            "occurrences_beyond_first": sum(duplicate_by_slug.values()),
            "duplicate_keys": len(duplicate_by_slug),
            "by_slug": duplicate_by_slug,
            "previous_bootstrap_occurrences_removed": 0,
        },
        "known_non_strict_cidrs": {
            "policy": "Candidate exceptions require manual review before publication.",
            "entries": non_strict_cidrs,
            "previous_bootstrap_entries_removed": 0,
        },
        "next_gate": {
            "exact_duplicate_occurrences_beyond_first": sum(duplicate_by_slug.values()),
            "non_strict_cidr_entries": len(non_strict_cidrs),
            "semantic_coverage_must_not_increase": True,
            "cross_segment_dependencies_must_not_increase": True,
        },
    }
    upstreams = {
        "schema_version": 1,
        "reviewed_on": None,
        "scope_note": "Legacy import cannot recover upstream provenance.",
        "upstreams": [],
        "unlicensed_evidence": {
            "policy": "Do not publish until provenance and license review is complete.",
            "included_sources": [],
        },
    }
    review = {
        "schema_version": 1,
        "reviewed_on": None,
        "purpose": "Legacy import candidate awaiting manual review.",
        "allowed_statuses": [
            "observe",
            "legacy",
            "brand-defense",
            "personal-community",
            "candidate-remove",
            "candidate-move",
        ],
        "items": [],
    }
    for filename, data in (
        ("manifest.yaml", manifest),
        ("proxy-groups.yaml", proxy_groups),
        ("base.yaml", base),
        ("quality-baseline.yaml", quality),
        ("upstreams.yaml", upstreams),
        ("review.yaml", review),
    ):
        write_text(
            args.output / filename,
            yaml.safe_dump(data, allow_unicode=True, sort_keys=False, width=1000),
        )

    temporary_sources = ProfileSources(
        root=args.output.resolve(),
        manifest=manifest,
        proxy_groups_document=proxy_groups,
        base=base,
        quality_baseline=quality,
        upstreams=upstreams,
        review=review,
        segments=tuple(
            Segment(
                order=record["order"],
                kind=record["kind"],
                slug=record["slug"],
                target=record["target"],
                scope=record["scope"],
                source=record.get("source"),
                matcher=record.get("matcher"),
            )
            for record in manifest_segments
        ),
        proxy_groups=tuple(
            ProxyGroup(
                order=record["order"],
                name=record["name"],
                type=record["type"],
                scope=record["scope"],
                members=tuple(record["members"]),
            )
            for record in canonical_groups
        ),
        rules={
            segment["slug"]: tuple(
                (rules_dir / f"{segment['slug']}.list")
                .read_text(encoding="utf-8")
                .splitlines()
            )
            for segment in manifest_segments
            if segment["kind"] == "ruleset"
        },
    )
    for product in (CORE_PRODUCT, EXTENDED_PRODUCT):
        quality["products"][product]["scope"] = scope_metrics(
            temporary_sources, product=product
        )
        quality["products"][product]["first_match_unreachable"] = coverage_metrics(
            temporary_sources, product=product
        )
    write_text(
        args.output / "quality-baseline.yaml",
        yaml.safe_dump(quality, allow_unicode=True, sort_keys=False, width=1000),
    )
    load_profile_sources(args.output)
    os.replace(args.output, final_output)
    atexit.unregister(cleanup_staging)
    cleanup_staging()
    print(
        json.dumps(
            {
                "status": "candidate-sources-created",
                "output": str(final_output),
                "rules": len(rules),
                "segments": len(segments),
                "groups": len(groups),
                "proxies_copied": 0,
                "requires_manual_provenance_review": True,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    try:
        main()
    except (FileExistsError, OSError, ValueError, ProfileError, yaml.YAMLError) as exc:
        print(f"legacy import failed: {exc}", file=sys.stderr)
        raise SystemExit(2) from exc
