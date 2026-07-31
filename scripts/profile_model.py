from __future__ import annotations

import hashlib
import json
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from ipaddress import IPv4Network, IPv6Network, ip_network
from collections.abc import Set as AbstractSet
from pathlib import Path, PurePosixPath
from typing import Any, Iterable
from urllib.parse import urlsplit

import yaml


FINAL_TARGET = "🐟 漏网之鱼"
NODE_PLACEHOLDER = "__ALL_SUBSCRIPTION_NODES__"
CORE_PRODUCT = "core"
EXTENDED_PRODUCT = "extended"
PRODUCTS = (CORE_PRODUCT, EXTENDED_PRODUCT)
CORE_SCOPE = "core"
OPTIONAL_SCOPE = "optional"
DESTINATION_IP_RULE_TYPES = {
    "IP-CIDR",
    "IP-CIDR6",
    "IP-SUFFIX",
    "IP-ASN",
    "GEOIP",
}
SUPPORTED_RULE_TYPES = {
    "DOMAIN",
    "DOMAIN-SUFFIX",
    "DOMAIN-KEYWORD",
    "PROCESS-NAME",
    *DESTINATION_IP_RULE_TYPES,
}
SLUG_PATTERN = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")
WINDOWS_ABSOLUTE_PATH = re.compile(r"(?<![A-Za-z])[A-Za-z]:[\\/]")
POSIX_ABSOLUTE_PATH = re.compile(r"(?m)(?<![:/\w.])/(?!/)[^\s`\"'<>]+")
SENSITIVE_FIELD = re.compile(
    r"(?im)^\s*(password|uuid|private-key|public-key|psk|secret|token):\s*\S+"
)
KNOWN_CREDENTIAL_PATTERN = re.compile(
    r"(?<![A-Za-z0-9])(?:"
    r"gh[pousr]_[A-Za-z0-9]{36,255}|"
    r"github_pat_[A-Za-z0-9_]{40,255}|"
    r"glpat-[A-Za-z0-9_-]{20,255}|"
    r"(?:AKIA|ASIA)[A-Z0-9]{16}"
    r")(?![A-Za-z0-9])"
)
LOG_LEVELS = {"silent", "error", "warning", "info", "debug"}
SCOPE_METRIC_KEYS = {
    "rule_files",
    "rule_segments",
    "terminal_segments",
    "proxy_groups",
    "rules_in_files",
    "rules_with_terminal",
    "destination_ip_rules",
    "destination_ip_rules_without_no_resolve",
}


class ProfileError(ValueError):
    pass


def _reject_duplicate_yaml_keys(node: yaml.Node, *, context: str) -> None:
    if isinstance(node, yaml.MappingNode):
        seen: set[tuple[str, str]] = set()
        for key_node, value_node in node.value:
            require(
                isinstance(key_node, yaml.ScalarNode),
                f"YAML mapping keys must be scalar in {context}",
            )
            key = (key_node.tag, key_node.value)
            require(key not in seen, f"Duplicate YAML key {key_node.value!r} in {context}")
            seen.add(key)
            _reject_duplicate_yaml_keys(value_node, context=context)
    elif isinstance(node, yaml.SequenceNode):
        for child in node.value:
            _reject_duplicate_yaml_keys(child, context=context)


def parse_yaml_document(text: str, *, context: str) -> Any:
    try:
        node = yaml.compose(text, Loader=yaml.SafeLoader)
        if node is not None:
            _reject_duplicate_yaml_keys(node, context=context)
        return yaml.safe_load(text)
    except yaml.YAMLError as exc:
        raise ProfileError(f"Cannot parse YAML {context}: {exc}") from exc


def _unique_json_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ProfileError(f"Duplicate JSON key: {key}")
        result[key] = value
    return result


def parse_json_document(text: str, *, context: str) -> Any:
    try:
        return json.loads(text, object_pairs_hook=_unique_json_object)
    except json.JSONDecodeError as exc:
        raise ProfileError(f"Cannot parse JSON {context}: {exc}") from exc
    except ProfileError as exc:
        raise ProfileError(f"Cannot parse JSON {context}: {exc}") from exc


def require_no_symlinks(root: Path, *, context: str) -> None:
    require(not root.is_symlink(), f"{context} root must not be a symbolic link")
    if not root.exists():
        return
    links = sorted(
        path.relative_to(root).as_posix()
        for path in root.rglob("*")
        if path.is_symlink()
    )
    require(not links, f"{context} contains symbolic links: {links}")


@dataclass(frozen=True)
class Segment:
    order: int
    kind: str
    slug: str
    target: str
    scope: str
    source: str | None = None
    matcher: str | None = None


@dataclass(frozen=True)
class ProxyGroup:
    order: int
    name: str
    type: str
    scope: str
    members: tuple[str, ...]


@dataclass(frozen=True)
class ProfileSources:
    root: Path
    manifest: dict[str, Any]
    proxy_groups_document: dict[str, Any]
    base: dict[str, Any]
    quality_baseline: dict[str, Any]
    upstreams: dict[str, Any]
    review: dict[str, Any]
    segments: tuple[Segment, ...]
    proxy_groups: tuple[ProxyGroup, ...]
    rules: dict[str, tuple[str, ...]]

    @property
    def rule_segments(self) -> tuple[Segment, ...]:
        return tuple(segment for segment in self.segments if segment.kind == "ruleset")

    @property
    def terminal(self) -> Segment:
        return self.segments[-1]

    def segments_for(self, product: str) -> tuple[Segment, ...]:
        require(product in PRODUCTS, f"Unknown product: {product}")
        if product == EXTENDED_PRODUCT:
            return self.segments
        return tuple(segment for segment in self.segments if segment.scope == CORE_SCOPE)

    def rule_segments_for(self, product: str) -> tuple[Segment, ...]:
        return tuple(
            segment
            for segment in self.segments_for(product)
            if segment.kind == "ruleset"
        )

    def proxy_groups_for(self, product: str) -> tuple[ProxyGroup, ...]:
        require(product in PRODUCTS, f"Unknown product: {product}")
        if product == EXTENDED_PRODUCT:
            return self.proxy_groups
        return tuple(group for group in self.proxy_groups if group.scope == CORE_SCOPE)


@dataclass(frozen=True)
class TreeDiff:
    missing: tuple[str, ...]
    extra: tuple[str, ...]
    changed: tuple[str, ...]
    missing_directories: tuple[str, ...] = ()
    extra_directories: tuple[str, ...] = ()

    @property
    def clean(self) -> bool:
        return not (
            self.missing
            or self.extra
            or self.changed
            or self.missing_directories
            or self.extra_directories
        )

    def as_dict(self) -> dict[str, list[str]]:
        return {
            "missing": list(self.missing),
            "extra": list(self.extra),
            "changed": list(self.changed),
            "missing_directories": list(self.missing_directories),
            "extra_directories": list(self.extra_directories),
        }


def load_yaml_mapping(path: Path) -> dict[str, Any]:
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        raise ProfileError(f"Cannot read YAML {path}: {exc}") from exc
    data = parse_yaml_document(text, context=str(path))
    if not isinstance(data, dict):
        raise ProfileError(f"Expected a YAML mapping in {path}")
    return data


def require(condition: object, message: str) -> None:
    if not condition:
        raise ProfileError(message)


def validate_https_url(value: Any, *, context: str) -> str:
    require(isinstance(value, str), f"{context} must be a string")
    parsed = urlsplit(value)
    require(parsed.scheme == "https" and parsed.hostname, f"{context} must use HTTPS")
    require(parsed.username is None and parsed.password is None, f"{context} must not contain userinfo")
    require(not parsed.query, f"{context} must not contain a query string")
    require(not parsed.fragment, f"{context} must not contain a fragment")
    return value


def validate_relative_posix_path(value: Any, *, expected: str, context: str) -> str:
    require(isinstance(value, str), f"{context} must be a string")
    require(value == expected, f"{context} must be {expected}")
    path = PurePosixPath(value)
    require(not path.is_absolute() and ".." not in path.parts, f"{context} must be relative")
    require("\\" not in value and not WINDOWS_ABSOLUTE_PATH.search(value), f"{context} is not portable")
    return value


def require_keys(
    mapping: dict[str, Any],
    *,
    required: AbstractSet[str],
    optional: AbstractSet[str] = frozenset(),
    context: str,
) -> None:
    keys = set(mapping)
    missing = required - keys
    extra = keys - required - optional
    require(not missing, f"{context} is missing keys: {sorted(missing)}")
    require(not extra, f"{context} has unsupported keys: {sorted(extra)}")


def read_rule_lines(path: Path) -> tuple[str, ...]:
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        raise ProfileError(f"Cannot read rule file {path}: {exc}") from exc
    lines = tuple(text.splitlines())
    require(lines, f"Rule file is empty: {path}")
    require(all(line and line == line.strip() for line in lines), f"Blank or padded rule in {path}")
    require(not any(line.startswith("#") for line in lines), f"Comments are not allowed in {path}")
    return lines


def parse_rule(entry: str, *, context: str) -> tuple[str, str, bool]:
    parts = [part.strip() for part in entry.split(",")]
    require(len(parts) >= 2, f"Malformed rule in {context}: {entry}")
    rule_type = parts[0]
    require(rule_type in SUPPORTED_RULE_TYPES, f"Unsupported rule type {rule_type} in {context}")
    has_no_resolve = parts[-1] == "no-resolve"
    value_parts = parts[1:-1] if has_no_resolve else parts[1:]
    require(len(value_parts) == 1 and value_parts[0], f"Malformed rule in {context}: {entry}")
    require(
        not has_no_resolve or rule_type in DESTINATION_IP_RULE_TYPES,
        f"no-resolve is only valid on destination-IP rules in {context}: {entry}",
    )
    require(
        rule_type not in DESTINATION_IP_RULE_TYPES or has_no_resolve,
        f"Destination-IP rule lacks no-resolve in {context}: {entry}",
    )
    return rule_type, value_parts[0], has_no_resolve


def _validate_manifest(data: dict[str, Any]) -> tuple[Segment, ...]:
    require_keys(
        data,
        required={"schema_version", "profile", "urls", "rule_provider", "segments"},
        context="sources/manifest.yaml",
    )
    require(data["schema_version"] == 1, "Unsupported manifest schema_version")

    profile = data["profile"]
    require(isinstance(profile, dict), "manifest.profile must be a mapping")
    require_keys(
        profile,
        required={"id", "repository", "branch", "generated_root"},
        context="manifest.profile",
    )
    require(profile["id"] == "reversed-profile", "Unexpected profile id")
    require(profile["generated_root"] == "generated/reversed-profile", "Unexpected generated_root")

    urls = data["urls"]
    require(isinstance(urls, dict), "manifest.urls must be a mapping")
    require_keys(
        urls,
        required={"rules_base", "providers_base", "base_config"},
        context="manifest.urls",
    )
    for key, value in urls.items():
        validate_https_url(value, context=f"manifest.urls.{key}")
    raw_root = (
        f"https://raw.githubusercontent.com/{profile['repository']}/"
        f"{profile['branch']}/{profile['generated_root']}"
    )
    require(
        urls
        == {
            "rules_base": f"{raw_root}/Ruleset",
            "providers_base": f"{raw_root}/Providers/Ruleset",
            "base_config": f"{raw_root}/base/GeneralClashConfig.yml",
        },
        "Published URLs must match the configured GitHub repository and generated root",
    )

    provider = data["rule_provider"]
    require(isinstance(provider, dict), "manifest.rule_provider must be a mapping")
    require_keys(
        provider,
        required={"type", "behavior", "format", "interval", "path_template"},
        context="manifest.rule_provider",
    )
    require(
        provider
        == {
            "type": "http",
            "behavior": "classical",
            "format": "yaml",
            "interval": 86400,
            "path_template": "./ruleset/{slug}.yaml",
        },
        "Unsupported rule-provider rendering configuration",
    )

    records = data["segments"]
    require(isinstance(records, list) and records, "manifest.segments must be a non-empty list")
    segments: list[Segment] = []
    for expected_order, record in enumerate(records, start=1):
        require(isinstance(record, dict), f"Segment {expected_order} must be a mapping")
        kind = record.get("kind")
        if kind == "ruleset":
            require_keys(
                record,
                required={"order", "kind", "slug", "target", "scope", "source"},
                context=f"segment {expected_order}",
            )
        elif kind == "terminal":
            require_keys(
                record,
                required={"order", "kind", "slug", "target", "scope", "matcher"},
                context=f"segment {expected_order}",
            )
        else:
            raise ProfileError(f"Unsupported segment kind at {expected_order}: {kind}")
        require(record["order"] == expected_order, f"Segment order mismatch at {expected_order}")
        require(
            isinstance(record["slug"], str) and SLUG_PATTERN.fullmatch(record["slug"]),
            f"Invalid segment slug at {expected_order}",
        )
        require(
            isinstance(record["target"], str) and record["target"],
            f"Invalid segment target at {expected_order}",
        )
        require(
            record["scope"] in {CORE_SCOPE, OPTIONAL_SCOPE},
            f"Invalid segment scope at {expected_order}",
        )
        if kind == "terminal":
            require(record["scope"] == CORE_SCOPE, "FINAL segment must be core")
        segments.append(
            Segment(
                order=record["order"],
                kind=kind,
                slug=record["slug"],
                target=record["target"],
                scope=record["scope"],
                source=record.get("source"),
                matcher=record.get("matcher"),
            )
        )

    terminals = [segment for segment in segments if segment.kind == "terminal"]
    require(len(terminals) == 1, "Manifest must contain exactly one terminal segment")
    require(segments[-1] == terminals[0], "Terminal segment must be last")
    require(
        terminals[0].slug == "final"
        and terminals[0].target == FINAL_TARGET
        and terminals[0].matcher == "MATCH",
        "Invalid FINAL segment",
    )
    rule_segments = [segment for segment in segments if segment.kind == "ruleset"]
    slugs = [segment.slug for segment in rule_segments]
    require(len(slugs) == len(set(slugs)), "Ruleset slugs must be unique")
    require("final" not in slugs, "The final slug is reserved")
    return tuple(segments)


def _validate_proxy_groups(data: dict[str, Any]) -> tuple[ProxyGroup, ...]:
    require_keys(
        data,
        required={"schema_version", "node_placeholder", "proxy_provider", "groups"},
        context="sources/proxy-groups.yaml",
    )
    require(data["schema_version"] == 1, "Unsupported proxy-group schema_version")
    require(data["node_placeholder"] == NODE_PLACEHOLDER, "Unexpected node placeholder")

    proxy_provider = data["proxy_provider"]
    require(isinstance(proxy_provider, dict), "proxy_provider must be a mapping")
    require_keys(
        proxy_provider,
        required={
            "name",
            "type",
            "url",
            "path",
            "interval",
            "health_check",
            "subconverter_filter",
        },
        context="proxy_provider",
    )
    require(proxy_provider["name"] == "subscription", "Unexpected proxy-provider name")
    require(proxy_provider["type"] == "http", "Only HTTP proxy providers are supported")
    require(proxy_provider["url"] == "PUT_YOUR_SUBSCRIPTION_URL_HERE", "Real subscription URL is forbidden")
    validate_relative_posix_path(
        proxy_provider["path"],
        expected="./proxy_provider/subscription.yaml",
        context="proxy_provider.path",
    )
    require(proxy_provider["subconverter_filter"] == ".*", "Unexpected Subconverter node filter")
    health_check = proxy_provider["health_check"]
    require(isinstance(health_check, dict), "health_check must be a mapping")
    require_keys(
        health_check,
        required={"enable", "url", "interval"},
        context="proxy_provider.health_check",
    )
    validate_https_url(
        health_check["url"], context="proxy_provider.health_check.url"
    )

    records = data["groups"]
    require(isinstance(records, list) and records, "groups must be a non-empty list")
    groups: list[ProxyGroup] = []
    for expected_order, record in enumerate(records, start=1):
        require(isinstance(record, dict), f"Proxy group {expected_order} must be a mapping")
        require_keys(
            record,
            required={"order", "name", "type", "scope", "members"},
            context=f"proxy group {expected_order}",
        )
        require(record["order"] == expected_order, f"Proxy-group order mismatch at {expected_order}")
        require(isinstance(record["name"], str) and record["name"], f"Invalid group name at {expected_order}")
        require(record["type"] == "select", f"Unsupported group type for {record['name']}")
        require(
            record["scope"] in {CORE_SCOPE, OPTIONAL_SCOPE},
            f"Invalid proxy-group scope for {record['name']}",
        )
        members = record["members"]
        require(
            isinstance(members, list) and all(isinstance(member, str) and member for member in members),
            f"Invalid members for {record['name']}",
        )
        require(
            members.count(NODE_PLACEHOLDER) == 1 and members[-1] == NODE_PLACEHOLDER,
            f"Subscription nodes must be a unique suffix in {record['name']}",
        )
        groups.append(
            ProxyGroup(
                order=record["order"],
                name=record["name"],
                type=record["type"],
                scope=record["scope"],
                members=tuple(members),
            )
        )

    names = [group.name for group in groups]
    require(len(names) == len(set(names)), "Proxy-group names must be unique")
    name_set = set(names)
    scope_by_name = {group.name: group.scope for group in groups}
    for group in groups:
        for member in group.members[:-1]:
            require(
                member == "DIRECT" or member in name_set,
                f"Proxy group {group.name} references unknown member {member}",
            )
            require(
                group.scope == OPTIONAL_SCOPE
                or member == "DIRECT"
                or scope_by_name[member] == CORE_SCOPE,
                f"Core proxy group {group.name} references optional member {member}",
            )
    return tuple(groups)


def _validate_base(data: dict[str, Any]) -> None:
    require_keys(
        data,
        required={
            "mixed-port",
            "allow-lan",
            "mode",
            "log-level",
            "external-controller",
            "proxies",
            "proxy-groups",
            "rules",
        },
        context="sources/base.yaml",
    )
    require(
        isinstance(data["mixed-port"], int)
        and not isinstance(data["mixed-port"], bool)
        and 1 <= data["mixed-port"] <= 65535,
        "mixed-port must be an integer from 1 through 65535",
    )
    require(isinstance(data["allow-lan"], bool), "allow-lan must be boolean")
    require(data["mode"] == "rule", "Base mode must be rule")
    require(data["log-level"] in LOG_LEVELS, "Base log-level is unsupported")
    controller = data["external-controller"]
    require(
        isinstance(controller, str)
        and re.fullmatch(r"(?:127\.0\.0\.1|localhost):(?:[1-9]\d{0,4})", controller)
        is not None
        and 1 <= int(controller.rsplit(":", 1)[1]) <= 65535,
        "external-controller must be a local host:port endpoint",
    )
    require(
        data["proxies"] == [] and data["proxy-groups"] == [] and data["rules"] == [],
        "Generated base slots must remain empty",
    )


def _validate_quality_baseline_schema(quality: dict[str, Any]) -> None:
    require_keys(
        quality,
        required={
            "schema_version",
            "phase",
            "measured_on",
            "products",
            "exact_duplicates_within_segment",
            "known_non_strict_cidrs",
            "next_gate",
        },
        context="sources/quality-baseline.yaml",
    )
    require(quality["schema_version"] == 1, "Unsupported quality-baseline schema")
    products = quality["products"]
    require(
        isinstance(products, dict) and set(products) == set(PRODUCTS),
        "Quality baseline must define Core and Extended",
    )
    for product in PRODUCTS:
        section = products[product]
        require(isinstance(section, dict), f"Quality baseline {product} must be a mapping")
        require_keys(
            section,
            required={"scope", "first_match_unreachable"},
            context=f"quality baseline {product}",
        )
        scope = section["scope"]
        require(
            isinstance(scope, dict) and set(scope) == SCOPE_METRIC_KEYS,
            f"Quality baseline {product} scope schema differs",
        )
        require(
            all(isinstance(scope[key], int) and not isinstance(scope[key], bool) for key in SCOPE_METRIC_KEYS),
            f"Quality baseline {product} scope metrics must be integers",
        )
        coverage = section["first_match_unreachable"]
        require(
            isinstance(coverage, dict)
            and set(coverage) == {"global", "within_same_segment", "cross_segment_only"},
            f"Quality baseline {product} coverage schema differs",
        )
        for category in ("global", "within_same_segment"):
            metrics = coverage[category]
            require(
                isinstance(metrics, dict)
                and set(metrics)
                == {
                    "exact_occurrences",
                    "broad_coverage_occurrences",
                    "overlap_between_categories",
                    "union",
                }
                and all(
                    isinstance(value, int) and not isinstance(value, bool)
                    for value in metrics.values()
                ),
                f"Quality baseline {product} {category} coverage differs",
            )
        require(
            isinstance(coverage["cross_segment_only"], dict)
            and set(coverage["cross_segment_only"]) == {"union"}
            and isinstance(coverage["cross_segment_only"]["union"], int)
            and not isinstance(coverage["cross_segment_only"]["union"], bool),
            f"Quality baseline {product} cross-segment coverage differs",
        )


def scope_metrics(sources: ProfileSources, *, product: str) -> dict[str, int]:
    rule_segments = sources.rule_segments_for(product)
    entries = [
        entry
        for segment in rule_segments
        for entry in sources.rules[segment.slug]
    ]
    destination_entries = [
        entry
        for entry in entries
        if entry.split(",", 1)[0] in DESTINATION_IP_RULE_TYPES
    ]
    return {
        "rule_files": len(rule_segments),
        "rule_segments": len(rule_segments),
        "terminal_segments": sum(
            segment.kind == "terminal" for segment in sources.segments_for(product)
        ),
        "proxy_groups": len(sources.proxy_groups_for(product)),
        "rules_in_files": len(entries),
        "rules_with_terminal": len(entries) + 1,
        "destination_ip_rules": len(destination_entries),
        "destination_ip_rules_without_no_resolve": sum(
            not parse_rule(entry, context=f"{product} scope metric")[2]
            for entry in destination_entries
        ),
    }


def _known_non_strict_cidrs(quality: dict[str, Any]) -> list[dict[str, str]]:
    section = quality.get("known_non_strict_cidrs")
    if not isinstance(section, dict):
        raise ProfileError("quality baseline lacks known_non_strict_cidrs")
    records = section.get("entries")
    if not isinstance(records, list):
        raise ProfileError("known_non_strict_cidrs.entries must be a list")
    result: list[dict[str, str]] = []
    for record in records:
        require(
            isinstance(record, dict)
            and set(record) == {"slug", "rule"}
            and isinstance(record["slug"], str)
            and isinstance(record["rule"], str),
            "Invalid known non-strict CIDR record",
        )
        result.append({"slug": record["slug"], "rule": record["rule"]})
    return result


def _validate_rules(
    root: Path,
    segments: tuple[Segment, ...],
    quality: dict[str, Any],
) -> dict[str, tuple[str, ...]]:
    rules_dir = (root / "rules").resolve()
    rules: dict[str, tuple[str, ...]] = {}
    expected_names: set[str] = set()
    invalid_cidrs: list[dict[str, str]] = []
    for segment in segments:
        if segment.kind != "ruleset":
            continue
        if segment.source is None:
            raise ProfileError(f"Ruleset {segment.slug} lacks a source")
        source = segment.source
        source_path = (root / source).resolve()
        require(source_path.is_relative_to(root.resolve()), f"Rule source escapes sources/: {source}")
        require(
            source_path == rules_dir / f"{segment.slug}.list",
            f"Rule source must match its slug: {segment.slug}",
        )
        expected_names.add(source_path.name)
        entries = read_rule_lines(source_path)
        for entry in entries:
            rule_type, value, _ = parse_rule(entry, context=source)
            if rule_type in {"IP-CIDR", "IP-CIDR6"}:
                try:
                    network = ip_network(value, strict=True)
                    require(
                        (rule_type == "IP-CIDR" and isinstance(network, IPv4Network))
                        or (rule_type == "IP-CIDR6" and isinstance(network, IPv6Network)),
                        f"CIDR family differs from rule type in {segment.source}: {entry}",
                    )
                except ValueError:
                    invalid_cidrs.append({"slug": segment.slug, "rule": entry})
            rules[segment.slug] = entries

    actual_names = {path.name for path in rules_dir.glob("*.list")}
    require(actual_names == expected_names, "Canonical rule files do not exactly match manifest")
    require(
        invalid_cidrs == _known_non_strict_cidrs(quality),
        "Non-strict CIDR set differs from the explicit temporary baseline",
    )

    duplicate_section = quality.get("exact_duplicates_within_segment")
    if not isinstance(duplicate_section, dict):
        raise ProfileError("Quality baseline lacks exact duplicate metrics")
    actual_by_slug: dict[str, int] = {}
    for slug, entries in rules.items():
        counts = Counter(entries)
        duplicates = sum(count - 1 for count in counts.values() if count > 1)
        if duplicates:
            actual_by_slug[slug] = duplicates
    require(
        actual_by_slug == duplicate_section.get("by_slug"),
        "Per-segment exact duplicate baseline differs from canonical rules",
    )
    require(
        sum(actual_by_slug.values()) == duplicate_section.get("occurrences_beyond_first"),
        "Exact duplicate total differs from canonical rules",
    )
    return rules


def load_profile_sources(root: Path) -> ProfileSources:
    require_no_symlinks(root, context="Canonical sources")
    root = root.resolve()
    require(root.is_dir(), f"Sources directory does not exist: {root}")
    expected_root_files = {
        "manifest.yaml",
        "proxy-groups.yaml",
        "base.yaml",
        "upstreams.yaml",
        "quality-baseline.yaml",
        "review.yaml",
    }
    actual_root_files = {path.name for path in root.iterdir() if path.is_file()}
    require(actual_root_files == expected_root_files, "Unexpected or missing source metadata files")
    require(
        {path.name for path in root.iterdir() if path.is_dir()} == {"rules"},
        "sources/ may only contain the rules/ directory",
    )

    manifest = load_yaml_mapping(root / "manifest.yaml")
    proxy_groups_document = load_yaml_mapping(root / "proxy-groups.yaml")
    base = load_yaml_mapping(root / "base.yaml")
    quality = load_yaml_mapping(root / "quality-baseline.yaml")
    upstreams = load_yaml_mapping(root / "upstreams.yaml")
    review = load_yaml_mapping(root / "review.yaml")

    segments = _validate_manifest(manifest)
    proxy_groups = _validate_proxy_groups(proxy_groups_document)
    _validate_base(base)
    _validate_quality_baseline_schema(quality)
    rules = _validate_rules(root, segments, quality)

    group_names = {group.name for group in proxy_groups}
    core_group_names = {
        group.name for group in proxy_groups if group.scope == CORE_SCOPE
    }
    for segment in segments:
        if segment.kind == "ruleset":
            require(
                segment.target == "DIRECT" or segment.target in group_names,
                f"Ruleset {segment.slug} targets unknown policy {segment.target}",
            )
            require(
                segment.scope == OPTIONAL_SCOPE
                or segment.target == "DIRECT"
                or segment.target in core_group_names,
                f"Core ruleset {segment.slug} targets an optional policy",
            )
    require(
        segments[-1].kind == "terminal" and segments[-1].scope == CORE_SCOPE,
        "Every product must inherit one final terminal segment",
    )

    source_text = "\n".join(
        path.read_text(encoding="utf-8")
        for path in root.rglob("*")
        if path.is_file()
    )
    require(not WINDOWS_ABSOLUTE_PATH.search(source_text), "Absolute Windows path found in sources")
    require(not POSIX_ABSOLUTE_PATH.search(source_text), "Absolute POSIX path found in sources")
    require(not SENSITIVE_FIELD.search(source_text), "Sensitive connection field found in sources")
    require(
        not KNOWN_CREDENTIAL_PATTERN.search(source_text),
        "Credential-shaped token found in sources",
    )

    loaded = ProfileSources(
        root=root,
        manifest=manifest,
        proxy_groups_document=proxy_groups_document,
        base=base,
        quality_baseline=quality,
        upstreams=upstreams,
        review=review,
        segments=segments,
        proxy_groups=proxy_groups,
        rules=rules,
    )
    for product in PRODUCTS:
        require(
            scope_metrics(loaded, product=product)
            == quality["products"][product]["scope"],
            f"Canonical {product} scope differs from the quality baseline",
        )
    return loaded


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content.rstrip() + "\n", encoding="utf-8", newline="\n")


def write_yaml(path: Path, data: Any) -> None:
    write_text(
        path,
        yaml.safe_dump(data, allow_unicode=True, sort_keys=False, width=1000),
    )


def ini_group_line(group: ProxyGroup, node_filter: str) -> str:
    tokens = [node_filter if member == NODE_PLACEHOLDER else f"[]{member}" for member in group.members]
    return "`".join([f"custom_proxy_group={group.name}", group.type, *tokens])


def _write_rulesets(output: Path, sources: ProfileSources) -> None:
    for segment in sources.rule_segments:
        entries = sources.rules[segment.slug]
        source_path = sources.root / str(segment.source)
        destination = output / "Ruleset" / f"{segment.slug}.list"
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(source_path.read_bytes())
        write_yaml(
            output / "Providers" / "Ruleset" / f"{segment.slug}.yaml",
            {"payload": list(entries)},
        )


def _subconverter_lines(
    sources: ProfileSources,
    *,
    product: str,
    local: bool,
    include_base: bool,
) -> list[str]:
    urls = sources.manifest["urls"]
    base_path = (
        "base/GeneralClashConfig.yml" if local else urls["base_config"]
    )
    lines = [
        "[custom]",
        "",
        (
            f"clash_rule_base={base_path}"
            if include_base
            else f";clash_rule_base={base_path}"
        ),
    ]
    for segment in sources.segments_for(product):
        if segment.kind == "terminal":
            lines.append(f"ruleset={segment.target},[]FINAL")
        elif local:
            lines.append(f"ruleset={segment.target},Ruleset/{segment.slug}.list")
        else:
            lines.append(
                f"ruleset={segment.target},{urls['rules_base']}/{segment.slug}.list"
            )

    node_filter = sources.proxy_groups_document["proxy_provider"]["subconverter_filter"]
    group_lines = [
        ini_group_line(group, node_filter)
        for group in sources.proxy_groups_for(product)
    ]
    lines.extend(
        [
            "",
            "enable_rule_generator=true",
            "overwrite_original_rules=true",
            "",
            *group_lines,
            "",
            "# Subscription nodes are supplied dynamically; ports, DNS, and TUN remain client-owned.",
        ]
    )
    return lines


def _write_subconverter(output: Path, sources: ProfileSources) -> None:
    presets = (
        ("ekko-rules.ini", CORE_PRODUCT, False, False),
        ("ekko-rules-full.ini", CORE_PRODUCT, False, True),
        ("ekko-rules-local.ini", CORE_PRODUCT, True, False),
        ("ekko-rules-extended.ini", EXTENDED_PRODUCT, False, False),
        ("ekko-rules-extended-local.ini", EXTENDED_PRODUCT, True, False),
    )
    for filename, product, local, include_base in presets:
        write_text(
            output / "config" / filename,
            "\n".join(
                _subconverter_lines(
                    sources,
                    product=product,
                    local=local,
                    include_base=include_base,
                )
            ),
        )


def _mihomo_config(sources: ProfileSources, *, product: str) -> dict[str, Any]:
    provider_settings = sources.manifest["rule_provider"]
    providers_base = sources.manifest["urls"]["providers_base"]
    rule_providers: dict[str, Any] = {}
    rules: list[str] = []
    for segment in sources.segments_for(product):
        if segment.kind == "terminal":
            rules.append(f"MATCH,{segment.target}")
            continue
        rule_providers[segment.slug] = {
            "type": provider_settings["type"],
            "behavior": provider_settings["behavior"],
            "format": provider_settings["format"],
            "url": f"{providers_base}/{segment.slug}.yaml",
            "path": provider_settings["path_template"].format(slug=segment.slug),
            "interval": provider_settings["interval"],
        }
        rules.append(f"RULE-SET,{segment.slug},{segment.target}")

    proxy_provider = sources.proxy_groups_document["proxy_provider"]
    config: dict[str, Any] = {
        key: value
        for key, value in sources.base.items()
        if key not in {"proxies", "proxy-groups", "rules"}
    }
    config["proxy-providers"] = {
        proxy_provider["name"]: {
            "type": proxy_provider["type"],
            "url": proxy_provider["url"],
            "path": proxy_provider["path"],
            "interval": proxy_provider["interval"],
            "health-check": proxy_provider["health_check"],
        }
    }
    config["proxy-groups"] = [
        {
            "name": group.name,
            "type": group.type,
            "proxies": [
                member for member in group.members if member != NODE_PLACEHOLDER
            ],
            "use": [proxy_provider["name"]],
        }
        for group in sources.proxy_groups_for(product)
    ]
    config["rule-providers"] = rule_providers
    config["rules"] = rules
    return config


def _write_mihomo(output: Path, sources: ProfileSources) -> None:
    write_yaml(
        output / "Mihomo" / "reversed-template.yaml",
        _mihomo_config(sources, product=CORE_PRODUCT),
    )
    write_yaml(
        output / "Mihomo" / "reversed-template-extended.yaml",
        _mihomo_config(sources, product=EXTENDED_PRODUCT),
    )


def _restored_rule(entry: str, target: str) -> str:
    parts = entry.split(",")
    if parts[-1] == "no-resolve":
        return ",".join([*parts[:-1], target, "no-resolve"])
    return f"{entry},{target}"


def _rule_matcher(entry: str) -> str:
    parts = entry.split(",")
    return ",".join(parts[:-1]) if parts[-1] == "no-resolve" else entry


def _product_analysis(sources: ProfileSources, product: str) -> dict[str, Any]:
    restored_rules: list[str] = []
    matcher_targets: dict[str, set[str]] = defaultdict(set)
    segment_records: list[dict[str, Any]] = []
    position = 1
    for product_index, segment in enumerate(sources.segments_for(product), start=1):
        if segment.kind == "terminal":
            segment_records.append(
                {
                    "index": product_index,
                    "manifest_order": segment.order,
                    "start": position,
                    "end": position,
                    "count": 1,
                    "target": segment.target,
                    "slug": segment.slug,
                    "scope": segment.scope,
                    "rule_types": {"MATCH": 1},
                }
            )
            continue
        entries = sources.rules[segment.slug]
        types = Counter(entry.split(",", 1)[0] for entry in entries)
        for entry in entries:
            restored = _restored_rule(entry, segment.target)
            restored_rules.append(restored)
            matcher_targets[_rule_matcher(entry)].add(segment.target)
        segment_records.append(
            {
                "index": product_index,
                "manifest_order": segment.order,
                "start": position,
                "end": position + len(entries) - 1,
                "count": len(entries),
                "target": segment.target,
                "slug": segment.slug,
                "scope": segment.scope,
                "rule_types": dict(types),
            }
        )
        position += len(entries)

    duplicate_counts = Counter(restored_rules)
    product_slugs = {segment.slug for segment in sources.rule_segments_for(product)}
    destination_ip_rules = destination_ip_rule_count(
        sources.rules[slug] for slug in product_slugs
    )
    return {
        "summary": {
            "proxy_group_count": len(sources.proxy_groups_for(product)),
            "ruleset_count": len(sources.rule_segments_for(product)),
            "segment_count": len(sources.segments_for(product)),
            "rule_count": len(restored_rules) + 1,
            "destination_ip_rule_count": destination_ip_rules,
        },
        "quality": {
            "first_match_unreachable": coverage_metrics(sources, product=product),
            "exact_duplicate_occurrences_beyond_first": sum(
                count - 1 for count in duplicate_counts.values() if count > 1
            ),
            "exact_duplicate_rule_keys": sum(
                1 for count in duplicate_counts.values() if count > 1
            ),
            "matchers_routed_to_multiple_targets": sum(
                1 for targets in matcher_targets.values() if len(targets) > 1
            ),
        },
        "segments": segment_records,
    }


def build_analysis(sources: ProfileSources) -> dict[str, Any]:
    return {
        "canonical_source": "sources/",
        "products": {
            product: _product_analysis(sources, product) for product in PRODUCTS
        },
        "invariants": {
            "manifest_order_is_contiguous": True,
            "terminal_is_unique_and_last_per_product": True,
            "ruleset_slugs_are_unique": True,
            "proxy_group_references_are_closed_per_product": True,
            "all_destination_ip_rules_use_no_resolve": True,
            "baseline": "sources/quality-baseline.yaml",
        },
        "security": {
            "contains_proxy_nodes": False,
            "contains_real_subscription_url": False,
            "contains_source_credentials": False,
        },
    }


def _write_readmes(output: Path, sources: ProfileSources) -> None:
    rules_base = sources.manifest["urls"]["rules_base"]
    chinese = f"""# Ekko Rules

[English](README_EN.md)

面向 Subconverter 与 Mihomo 的可复用分流规则和订阅模板。本目录由仓库内脱敏规范源确定性生成，不包含代理服务器、密码、UUID、密钥或真实订阅地址。

## 产物

- `config/ekko-rules.ini`：默认 Core 在线预设，不覆盖 Subconverter 服务端的 Clash 基础配置。
- `config/ekko-rules-full.ini`：Core + 脱敏基础配置；不暗含 optional 规则。
- `config/ekko-rules-local.ini`：本地 Core 预设，基础配置默认注释。
- `config/ekko-rules-extended.ini`：Core + legacy/品牌防御/社区 optional 规则，不覆盖基础配置。
- `config/ekko-rules-extended-local.ini`：本地 Extended 预设。
- `base/GeneralClashConfig.yml`：可选且脱敏的 Clash 基础配置。
- `Ruleset/*.list`：供 Subconverter 使用的经典规则集。
- `Providers/Ruleset/*.yaml`：供 Mihomo 使用的 classical Rule Provider。
- `Mihomo/reversed-template.yaml`：默认 Core Mihomo 模板。
- `Mihomo/reversed-template-extended.yaml`：Extended Mihomo 模板。
- `analysis.json`：由当前规范源计算的结构与质量统计。
- `manifest.json`：生成文件清单和 SHA-256；清单不递归哈希自身。

## 使用

1. 发布后，Ruleset 地址前缀为 `{rules_base}`。
2. Subconverter 推荐使用 `config/ekko-rules.ini`；端口、DNS、TUN 等由服务端或客户端负责。
3. Mihomo 用户需要将模板中的 `PUT_YOUR_SUBSCRIPTION_URL_HERE` 替换为自己的订阅地址。
4. 仓库保持私有时，外部客户端通常无法匿名读取 GitHub Raw 地址。

## 行为说明

- Core 为 {len(sources.rule_segments_for(CORE_PRODUCT))} 个 ruleset、{len(sources.segments_for(CORE_PRODUCT))} 个区段、{len(sources.proxy_groups_for(CORE_PRODUCT))} 个策略组。
- Extended 为 {len(sources.rule_segments_for(EXTENDED_PRODUCT))} 个 ruleset、{len(sources.segments_for(EXTENDED_PRODUCT))} 个区段、{len(sources.proxy_groups_for(EXTENDED_PRODUCT))} 个策略组。
- Messaging 与音乐按服务拆分；同类服务仍可共用原策略组。
- AI、社交和开发服务拥有最小独立策略组；Private 基础层直接指向 `DIRECT`。
- 所有目标 IP 规则统一带 `no-resolve`。
- 同一区段 exact 重复已清零；5 条非 strict CIDR 已删除而未猜测改写前缀。
- 过宽地区 TLD、共享云网段和共享基础设施已从前置专用策略移除或迁到综合策略。
- DNS、TUN、Hosts 和节点凭据不属于核心规则职责。
"""
    english = f"""# Ekko Rules

[中文](README.md)

Reusable routing rules and subscription templates for Subconverter and Mihomo. This directory is generated deterministically from sanitized in-repository canonical sources and contains no proxy nodes, passwords, UUIDs, keys, or real subscription URLs.

## Outputs

- `config/ekko-rules.ini`: Default Core online preset without a Clash base override.
- `config/ekko-rules-full.ini`: Core plus the sanitized base; it does not silently enable optional rules.
- `config/ekko-rules-local.ini`: Local Core preset with its base disabled by default.
- `config/ekko-rules-extended.ini`: Core plus optional legacy, brand-defense, and community rules without a base override.
- `config/ekko-rules-extended-local.ini`: Local Extended preset.
- `base/GeneralClashConfig.yml`: Optional sanitized Clash base.
- `Ruleset/*.list`: Classical Subconverter rules.
- `Providers/Ruleset/*.yaml`: Classical Mihomo Rule Providers.
- `Mihomo/reversed-template.yaml`: Default Core Mihomo template.
- `Mihomo/reversed-template-extended.yaml`: Extended Mihomo template.
- `analysis.json`: Structure and quality metrics computed from canonical sources.
- `manifest.json`: Generated-file SHA-256 inventory; it does not recursively hash itself.

## Usage

1. After publication, the Ruleset URL prefix is `{rules_base}`.
2. Use `config/ekko-rules.ini` for Subconverter. Ports, DNS, TUN, and similar client settings remain externally owned.
3. Mihomo users must replace `PUT_YOUR_SUBSCRIPTION_URL_HERE` in the native template.
4. External clients normally cannot fetch GitHub Raw files anonymously while the repository is private.

## Behavior

- Core contains {len(sources.rule_segments_for(CORE_PRODUCT))} rulesets, {len(sources.segments_for(CORE_PRODUCT))} segments, and {len(sources.proxy_groups_for(CORE_PRODUCT))} proxy groups.
- Extended contains {len(sources.rule_segments_for(EXTENDED_PRODUCT))} rulesets, {len(sources.segments_for(EXTENDED_PRODUCT))} segments, and {len(sources.proxy_groups_for(EXTENDED_PRODUCT))} proxy groups.
- Messaging and music are split by service while related services may still share an existing policy group.
- AI, social, and developer services have minimal independent groups; the Private layer targets `DIRECT`.
- Every destination-IP rule carries `no-resolve`.
- Same-segment exact duplicates are zero; five non-strict CIDRs were deleted without guessing corrected prefixes.
- Broad regional TLDs, shared cloud ranges, and shared infrastructure were removed from early service-specific policies or moved to general routing.
- DNS, TUN, Hosts, and proxy credentials are outside the core ruleset scope.
"""
    write_text(output / "README.md", chinese)
    write_text(output / "README_EN.md", english)


def expected_generated_files(sources: ProfileSources) -> set[str]:
    files = {
        "config/ekko-rules.ini",
        "config/ekko-rules-full.ini",
        "config/ekko-rules-local.ini",
        "config/ekko-rules-extended.ini",
        "config/ekko-rules-extended-local.ini",
        "Mihomo/reversed-template.yaml",
        "Mihomo/reversed-template-extended.yaml",
        "base/GeneralClashConfig.yml",
        "analysis.json",
        "README.md",
        "README_EN.md",
        "manifest.json",
    }
    for segment in sources.rule_segments:
        files.add(f"Ruleset/{segment.slug}.list")
        files.add(f"Providers/Ruleset/{segment.slug}.yaml")
    return files


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_generated_manifest(output: Path, sources: ProfileSources) -> None:
    expected = expected_generated_files(sources) - {"manifest.json"}
    actual = {
        path.relative_to(output).as_posix()
        for path in output.rglob("*")
        if path.is_file()
    }
    require(actual == expected, "Rendered files do not match the expected product set")
    expected_directories = {
        "Mihomo",
        "Providers",
        "Providers/Ruleset",
        "Ruleset",
        "base",
        "config",
    }
    actual_directories = {
        path.relative_to(output).as_posix()
        for path in output.rglob("*")
        if path.is_dir()
    }
    require(
        actual_directories == expected_directories,
        "Rendered directories do not match the expected product set",
    )
    manifest = {
        "schema_version": 1,
        "profile": sources.manifest["profile"]["id"],
        "hash_algorithm": "sha256",
        "self": "manifest.json",
        "self_hash_included": False,
        "files": {
            relative: file_sha256(output / relative)
            for relative in sorted(expected)
        },
    }
    write_text(output / "manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))


def validate_generated_manifest(output: Path, sources: ProfileSources) -> None:
    require_no_symlinks(output, context="Generated products")
    path = output / "manifest.json"
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        raise ProfileError(f"Cannot read generated manifest: {exc}") from exc
    manifest = parse_json_document(text, context=str(path))
    require(
        manifest.get("schema_version") == 1
        and manifest.get("hash_algorithm") == "sha256"
        and manifest.get("self") == "manifest.json"
        and manifest.get("self_hash_included") is False,
        "Invalid generated manifest header",
    )
    expected_files = expected_generated_files(sources)
    actual_files = {
        path.relative_to(output).as_posix()
        for path in output.rglob("*")
        if path.is_file()
    }
    require(actual_files == expected_files, "Generated file set is not closed")
    require(
        directory_snapshot(output)
        == {"Mihomo", "Providers", "Providers/Ruleset", "Ruleset", "base", "config"},
        "Generated directory set is not closed",
    )
    hashes = manifest.get("files")
    require(isinstance(hashes, dict), "Generated manifest files must be a mapping")
    require(set(hashes) == expected_files - {"manifest.json"}, "Generated hash set is not closed")
    for relative, expected_hash in hashes.items():
        require(
            isinstance(expected_hash, str)
            and file_sha256(output / relative) == expected_hash,
            f"Generated file hash mismatch: {relative}",
        )


def render_profile(sources: ProfileSources, output: Path) -> None:
    require(not output.exists(), f"Render destination already exists: {output}")
    output.mkdir(parents=True)
    _write_rulesets(output, sources)
    _write_subconverter(output, sources)
    _write_mihomo(output, sources)
    write_yaml(output / "base" / "GeneralClashConfig.yml", sources.base)
    write_text(
        output / "analysis.json",
        json.dumps(build_analysis(sources), ensure_ascii=False, indent=2),
    )
    _write_readmes(output, sources)
    write_generated_manifest(output, sources)
    validate_generated_manifest(output, sources)


def tree_snapshot(root: Path) -> dict[str, bytes]:
    if not root.is_dir():
        return {}
    return {
        path.relative_to(root).as_posix(): path.read_bytes()
        for path in root.rglob("*")
        if path.is_file()
    }


def directory_snapshot(root: Path) -> set[str]:
    if not root.is_dir():
        return set()
    return {
        path.relative_to(root).as_posix()
        for path in root.rglob("*")
        if path.is_dir()
    }


def compare_trees(expected: Path, actual: Path) -> TreeDiff:
    expected_files = tree_snapshot(expected)
    actual_files = tree_snapshot(actual)
    expected_names = set(expected_files)
    actual_names = set(actual_files)
    expected_directories = directory_snapshot(expected)
    actual_directories = directory_snapshot(actual)
    return TreeDiff(
        missing=tuple(sorted(expected_names - actual_names)),
        extra=tuple(sorted(actual_names - expected_names)),
        changed=tuple(
            sorted(
                name
                for name in expected_names & actual_names
                if expected_files[name] != actual_files[name]
            )
        ),
        missing_directories=tuple(sorted(expected_directories - actual_directories)),
        extra_directories=tuple(sorted(actual_directories - expected_directories)),
    )


def destination_ip_rule_count(rules: Iterable[tuple[str, ...]]) -> int:
    return sum(
        1
        for entries in rules
        for entry in entries
        if entry.split(",", 1)[0] in DESTINATION_IP_RULE_TYPES
    )


def rule_covers(earlier: str, later: str) -> bool:
    earlier_type, earlier_value, _ = parse_rule(
        earlier, context="coverage analysis"
    )
    later_type, later_value, _ = parse_rule(later, context="coverage analysis")
    earlier_value_normalized = earlier_value.rstrip(".").lower()
    later_value_normalized = later_value.rstrip(".").lower()

    if earlier_type == "DOMAIN":
        return later_type == "DOMAIN" and earlier_value_normalized == later_value_normalized
    if earlier_type == "DOMAIN-SUFFIX":
        if later_type not in {"DOMAIN", "DOMAIN-SUFFIX"}:
            return False
        return later_value_normalized == earlier_value_normalized or later_value_normalized.endswith(
            f".{earlier_value_normalized}"
        )
    if earlier_type == "DOMAIN-KEYWORD":
        if later_type not in {"DOMAIN", "DOMAIN-SUFFIX", "DOMAIN-KEYWORD"}:
            return False
        return earlier_value_normalized in later_value_normalized
    if earlier_type in {"IP-CIDR", "IP-CIDR6"}:
        if later_type != earlier_type:
            return False
        try:
            earlier_network = ip_network(earlier_value, strict=False)
            later_network = ip_network(later_value, strict=False)
        except ValueError:
            return False
        return (
            isinstance(later_network, IPv4Network)
            and isinstance(earlier_network, IPv4Network)
            and later_network.subnet_of(earlier_network)
        ) or (
            isinstance(later_network, IPv6Network)
            and isinstance(earlier_network, IPv6Network)
            and later_network.subnet_of(earlier_network)
        )
    if earlier_type == "IP-SUFFIX":
        return later_type == "IP-SUFFIX" and later_value.endswith(earlier_value)
    return earlier_type == later_type and earlier_value.casefold() == later_value.casefold()


def _new_coverage_index() -> dict[str, Any]:
    return {
        "exact": set(),
        "domain_suffixes": set(),
        "domain_keywords": set(),
        "ipv4_networks": [],
        "ipv6_networks": [],
        "ip_suffixes": set(),
    }


def _is_broadly_covered(entry: str, index: dict[str, Any]) -> bool:
    rule_type, value, _ = parse_rule(entry, context="coverage analysis")
    normalized_value = value.rstrip(".").lower()
    if rule_type in {"DOMAIN", "DOMAIN-SUFFIX"}:
        labels = normalized_value.split(".")
        candidate_suffixes = {".".join(labels[offset:]) for offset in range(len(labels))}
        if rule_type == "DOMAIN-SUFFIX":
            candidate_suffixes.discard(normalized_value)
        if candidate_suffixes & index["domain_suffixes"]:
            return True
        return any(keyword in normalized_value for keyword in index["domain_keywords"])
    if rule_type == "DOMAIN-KEYWORD":
        return any(
            keyword != normalized_value and keyword in normalized_value
            for keyword in index["domain_keywords"]
        )
    if rule_type in {"IP-CIDR", "IP-CIDR6"}:
        try:
            network = ip_network(value, strict=False)
        except ValueError:
            return False
        networks = (
            index["ipv4_networks"]
            if isinstance(network, IPv4Network)
            else index["ipv6_networks"]
        )
        return any(
            network != earlier and network.subnet_of(earlier)
            for earlier in networks
        )
    if rule_type == "IP-SUFFIX":
        return any(
            suffix != value and value.endswith(suffix)
            for suffix in index["ip_suffixes"]
        )
    return False


def _add_to_coverage_index(entry: str, index: dict[str, Any]) -> None:
    rule_type, value, _ = parse_rule(entry, context="coverage analysis")
    index["exact"].add(entry)
    normalized_value = value.rstrip(".").lower()
    if rule_type == "DOMAIN-SUFFIX":
        index["domain_suffixes"].add(normalized_value)
    elif rule_type == "DOMAIN-KEYWORD":
        index["domain_keywords"].add(normalized_value)
    elif rule_type in {"IP-CIDR", "IP-CIDR6"}:
        try:
            network = ip_network(value, strict=False)
        except ValueError:
            return
        key = "ipv4_networks" if isinstance(network, IPv4Network) else "ipv6_networks"
        index[key].append(network)
    elif rule_type == "IP-SUFFIX":
        index["ip_suffixes"].add(value)


def coverage_metrics(
    sources: ProfileSources, *, product: str = EXTENDED_PRODUCT
) -> dict[str, Any]:
    totals = {
        "global_exact": 0,
        "global_broad": 0,
        "global_overlap": 0,
        "global_union": 0,
        "same_exact": 0,
        "same_broad": 0,
        "same_overlap": 0,
        "same_union": 0,
        "cross_only": 0,
    }
    global_index = _new_coverage_index()
    for segment in sources.rule_segments_for(product):
        same_index = _new_coverage_index()
        for entry in sources.rules[segment.slug]:
            exact_any = entry in global_index["exact"]
            broad_any = _is_broadly_covered(entry, global_index)
            same_exact_any = entry in same_index["exact"]
            same_broad_any = _is_broadly_covered(entry, same_index)
            globally_unreachable = exact_any or broad_any
            same_unreachable = same_exact_any or same_broad_any

            totals["global_exact"] += int(exact_any)
            totals["global_broad"] += int(broad_any)
            totals["global_overlap"] += int(exact_any and broad_any)
            totals["global_union"] += int(globally_unreachable)
            totals["same_exact"] += int(same_exact_any)
            totals["same_broad"] += int(same_broad_any)
            totals["same_overlap"] += int(same_exact_any and same_broad_any)
            totals["same_union"] += int(same_unreachable)
            totals["cross_only"] += int(globally_unreachable and not same_unreachable)

            _add_to_coverage_index(entry, global_index)
            _add_to_coverage_index(entry, same_index)

    return {
        "global": {
            "exact_occurrences": totals["global_exact"],
            "broad_coverage_occurrences": totals["global_broad"],
            "overlap_between_categories": totals["global_overlap"],
            "union": totals["global_union"],
        },
        "within_same_segment": {
            "exact_occurrences": totals["same_exact"],
            "broad_coverage_occurrences": totals["same_broad"],
            "overlap_between_categories": totals["same_overlap"],
            "union": totals["same_union"],
        },
        "cross_segment_only": {"union": totals["cross_only"]},
    }


def rule_matches(
    entry: str,
    *,
    domain: str | None = None,
    ip: str | None = None,
    process_name: str | None = None,
) -> bool:
    rule_type, value, _ = parse_rule(entry, context="first-match evaluation")
    normalized_domain = domain.rstrip(".").lower() if domain else None
    normalized_value = value.rstrip(".").lower()
    if rule_type == "DOMAIN":
        return normalized_domain == normalized_value
    if rule_type == "DOMAIN-SUFFIX":
        return normalized_domain is not None and (
            normalized_domain == normalized_value
            or normalized_domain.endswith(f".{normalized_value}")
        )
    if rule_type == "DOMAIN-KEYWORD":
        return normalized_domain is not None and normalized_value in normalized_domain
    if rule_type in {"IP-CIDR", "IP-CIDR6"}:
        if ip is None:
            return False
        try:
            return ip_network(f"{ip}/32" if ":" not in ip else f"{ip}/128").network_address in ip_network(
                value, strict=False
            )
        except ValueError:
            return False
    if rule_type == "IP-SUFFIX":
        return ip is not None and ip.endswith(value)
    if rule_type == "PROCESS-NAME":
        return process_name is not None and process_name.casefold() == value.casefold()
    if rule_type in {"IP-ASN", "GEOIP"}:
        return False
    raise ProfileError(f"First-match evaluation does not support {rule_type}")


def first_match(
    sources: ProfileSources,
    *,
    product: str = EXTENDED_PRODUCT,
    domain: str | None = None,
    ip: str | None = None,
    process_name: str | None = None,
) -> dict[str, str]:
    for segment in sources.segments_for(product):
        if segment.kind == "terminal":
            return {
                "slug": segment.slug,
                "target": segment.target,
                "rule": "MATCH",
            }
        for entry in sources.rules[segment.slug]:
            if rule_matches(
                entry,
                domain=domain,
                ip=ip,
                process_name=process_name,
            ):
                return {
                    "slug": segment.slug,
                    "target": segment.target,
                    "rule": entry,
                }
    raise ProfileError("Canonical profile has no terminal match")
