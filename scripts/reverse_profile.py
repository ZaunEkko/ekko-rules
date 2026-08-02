from __future__ import annotations

import argparse
import atexit
import json
import os
import re
import shutil
import sys
import tempfile
from collections import Counter
from ipaddress import ip_network
from pathlib import Path
from typing import Any

import yaml

from profile_model import (
    CORE_PRODUCT,
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
            "subconverter_filter": ".*",
        },
        "groups": canonical_groups,
    }
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
            CORE_PRODUCT: {
                "scope": dict(imported_scope),
                "first_match_unreachable": dict(empty_coverage),
            }
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
    quality["products"][CORE_PRODUCT]["scope"] = scope_metrics(
        temporary_sources, product=CORE_PRODUCT
    )
    quality["products"][CORE_PRODUCT]["first_match_unreachable"] = coverage_metrics(
        temporary_sources, product=CORE_PRODUCT
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
