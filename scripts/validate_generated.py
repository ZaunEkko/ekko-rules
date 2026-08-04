from __future__ import annotations

import argparse
import configparser
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

from profile_model import (
    CORE_PRODUCT,
    DESTINATION_IP_RULE_TYPES,
    GENERATED_RULESET_ALIASES,
    generated_ruleset_alias_entries,
    NODE_PLACEHOLDER,
    POSIX_ABSOLUTE_PATH,
    ProfileError,
    ProfileSources,
    build_analysis,
    coverage_metrics,
    directory_snapshot,
    file_sha256,
    load_profile_sources,
    parse_json_document,
    parse_rule,
    parse_yaml_document,
    require_no_symlinks,
    scope_metrics,
    validate_https_url,
    KNOWN_CREDENTIAL_PATTERN,
)


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SOURCES = PROJECT_ROOT / "sources"
DEFAULT_GENERATED = PROJECT_ROOT / "generated" / "reversed-profile"
ALLOWED_GENERATED_ROOTS = {
    "Mihomo",
    "Providers",
    "README.md",
    "README_EN.md",
    "Ruleset",
    "analysis.json",
    "config",
    "manifest.json",
}
HIGH_ENTROPY_TOKEN = re.compile(r"(?<![A-Za-z0-9])[A-Za-z0-9_+/=-]{48,}(?![A-Za-z0-9])")
UUID_PATTERN = re.compile(
    r"(?i)(?<![0-9a-f])[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?![0-9a-f])"
)
SENSITIVE_YAML_KEYS = {
    "password",
    "private-key",
    "public-key",
    "psk",
    "secret",
    "server",
    "short-id",
    "token",
    "uuid",
}


class ValidationError(RuntimeError):
    pass


def check(condition: bool, message: str) -> None:
    if not condition:
        raise ValidationError(message)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate the Ekko Rules standard product against canonical sources."
    )
    parser.add_argument(
        "--sources",
        type=Path,
        default=DEFAULT_SOURCES,
        help=f"Canonical source directory (default: {DEFAULT_SOURCES})",
    )
    parser.add_argument(
        "--generated",
        type=Path,
        default=DEFAULT_GENERATED,
        help=f"Generated product directory (default: {DEFAULT_GENERATED})",
    )
    parser.add_argument(
        "--skip-generation-check",
        action="store_true",
        help="Skip invoking generate_profile.py --check after structural validation.",
    )
    return parser.parse_args()


def read_yaml(path: Path) -> Any:
    try:
        text = path.read_text(encoding="utf-8")
        return parse_yaml_document(text, context=str(path))
    except (OSError, UnicodeError, ProfileError) as exc:
        raise ValidationError(f"Cannot read YAML {path}: {exc}") from exc


def read_json(path: Path) -> Any:
    try:
        text = path.read_text(encoding="utf-8")
        return parse_json_document(text, context=str(path))
    except (OSError, UnicodeError, ProfileError) as exc:
        raise ValidationError(f"Cannot read JSON {path}: {exc}") from exc


def expected_generated_files(sources: ProfileSources) -> set[str]:
    files = {
        "config/ekko-rules.ini",
        "Mihomo/reversed-template.yaml",
        "analysis.json",
        "README.md",
        "README_EN.md",
        "manifest.json",
    }
    for slug in [
        *(segment.slug for segment in sources.rule_segments),
        *(
            alias
            for alias, metadata in GENERATED_RULESET_ALIASES.items()
            if metadata.canonical in sources.rules
        ),
    ]:
        files.add(f"Ruleset/{slug}.list")
        files.add(f"Providers/Ruleset/{slug}.yaml")
    return files


def validate_file_set(generated: Path, sources: ProfileSources) -> dict[str, Any]:
    try:
        require_no_symlinks(generated, context="Generated products")
    except ProfileError as exc:
        raise ValidationError(str(exc)) from exc
    check(generated.is_dir(), f"Generated directory does not exist: {generated}")
    check(
        {path.name for path in generated.iterdir()} == ALLOWED_GENERATED_ROOTS,
        "Generated root entries do not match the closed product layout",
    )
    actual_files = {
        path.relative_to(generated).as_posix()
        for path in generated.rglob("*")
        if path.is_file()
    }
    expected_files = expected_generated_files(sources)
    check(actual_files == expected_files, "Generated file collection differs from sources")
    check(
        directory_snapshot(generated)
        == {"Mihomo", "Providers", "Providers/Ruleset", "Ruleset", "config"},
        "Generated directory collection differs from sources",
    )

    manifest = read_json(generated / "manifest.json")
    check(isinstance(manifest, dict), "manifest.json must contain an object")
    check(
        manifest.get("schema_version") == 1
        and manifest.get("profile") == sources.manifest["profile"]["id"]
        and manifest.get("hash_algorithm") == "sha256"
        and manifest.get("self") == "manifest.json"
        and manifest.get("self_hash_included") is False,
        "Invalid generated manifest header",
    )
    hashes = manifest.get("files")
    check(isinstance(hashes, dict), "Generated manifest files must be an object")
    check(
        set(hashes) == expected_files - {"manifest.json"},
        "Generated manifest hash collection is not closed",
    )
    for relative, expected_hash in hashes.items():
        check(
            isinstance(expected_hash, str)
            and re.fullmatch(r"[0-9a-f]{64}", expected_hash) is not None,
            f"Invalid SHA-256 value for {relative}",
        )
        check(
            file_sha256(generated / relative) == expected_hash,
            f"Generated manifest hash mismatch: {relative}",
        )
    return manifest


def parse_ini(path: Path) -> tuple[list[str], list[str], list[str], list[str]]:
    parser = configparser.RawConfigParser(strict=False, delimiters=("=",))
    try:
        with path.open(encoding="utf-8") as handle:
            parser.read_file(handle)
    except (OSError, UnicodeError, configparser.Error) as exc:
        raise ValidationError(f"Cannot parse INI {path}: {exc}") from exc
    check(parser.has_section("custom"), f"Missing [custom] in {path}")
    lines = path.read_text(encoding="utf-8").splitlines()
    rules = [line for line in lines if line.startswith("ruleset=")]
    groups = [line for line in lines if line.startswith("custom_proxy_group=")]
    base_lines = [
        line
        for line in lines
        if line.startswith("clash_rule_base=") or line.startswith(";clash_rule_base=")
    ]
    controls = [
        line
        for line in lines
        if line.startswith("enable_rule_generator=")
        or line.startswith("overwrite_original_rules=")
    ]
    return rules, groups, base_lines, controls


def expected_ini_rules(
    sources: ProfileSources, *, product: str, local: bool
) -> list[str]:
    result: list[str] = []
    rules_base = sources.manifest["urls"]["rules_base"]
    for segment in sources.segments_for(product):
        if segment.kind == "terminal":
            result.append(f"ruleset={segment.target},[]FINAL")
        elif local:
            result.append(f"ruleset={segment.target},Ruleset/{segment.slug}.list")
        else:
            result.append(f"ruleset={segment.target},{rules_base}/{segment.slug}.list")
    return result


def expected_ini_groups(sources: ProfileSources, *, product: str) -> list[str]:
    node_filter = sources.proxy_groups_document["proxy_provider"]["subconverter_filter"]
    result: list[str] = []
    for group in sources.proxy_groups_for(product):
        members = [
            node_filter if member == NODE_PLACEHOLDER else f"[]{member}"
            for member in group.members
        ]
        result.append("`".join([f"custom_proxy_group={group.name}", group.type, *members]))
    return result


def validate_ini_presets(generated: Path, sources: ProfileSources) -> None:
    filename = "ekko-rules.ini"
    expected_rules = expected_ini_rules(
        sources, product=CORE_PRODUCT, local=False
    )
    expected_groups = expected_ini_groups(sources, product=CORE_PRODUCT)
    actual_rules, actual_groups, actual_base, actual_controls = parse_ini(
        generated / "config" / filename
    )
    check(actual_rules == expected_rules, f"Ordered ruleset entries differ in {filename}")
    check(actual_groups == expected_groups, f"Ordered proxy groups differ in {filename}")
    check(actual_base == [], f"clash_rule_base must be absent in {filename}")
    check(
        actual_controls
        == [
            "enable_rule_generator=true",
            "overwrite_original_rules=true",
        ],
        f"Rule-generator controls differ in {filename}",
    )


def validate_rulesets(generated: Path, sources: ProfileSources) -> tuple[int, int]:
    total_rules = 0
    destination_ip_rules = 0
    for segment in sources.rule_segments:
        source_path = sources.root / str(segment.source)
        list_path = generated / "Ruleset" / f"{segment.slug}.list"
        provider_path = generated / "Providers" / "Ruleset" / f"{segment.slug}.yaml"
        check(
            list_path.read_bytes() == source_path.read_bytes(),
            f"Generated Ruleset differs byte-for-byte: {segment.slug}",
        )
        entries = list_path.read_text(encoding="utf-8").splitlines()
        provider = read_yaml(provider_path)
        check(
            isinstance(provider, dict) and set(provider) == {"payload"},
            f"Provider wrapper is invalid: {segment.slug}",
        )
        check(provider["payload"] == entries, f"Provider payload differs: {segment.slug}")
        total_rules += len(entries)
        for entry in entries:
            rule_type, _, has_no_resolve = parse_rule(
                entry, context=f"Ruleset/{segment.slug}.list"
            )
            if rule_type in DESTINATION_IP_RULE_TYPES:
                destination_ip_rules += 1
                check(has_no_resolve, f"Destination-IP rule lacks no-resolve: {entry}")
    for alias_slug, alias in GENERATED_RULESET_ALIASES.items():
        expected_entries = generated_ruleset_alias_entries(sources, alias)
        if expected_entries is None:
            continue
        alias_list = generated / "Ruleset" / f"{alias_slug}.list"
        check(
            alias_list.read_text(encoding="utf-8").splitlines()
            == list(expected_entries),
            f"Compatibility Ruleset differs from frozen subset: {alias_slug}",
        )
        check(
            file_sha256(alias_list) == alias.list_sha256,
            f"Compatibility Ruleset hash differs: {alias_slug}",
        )
        alias_provider_path = (
            generated / "Providers" / "Ruleset" / f"{alias_slug}.yaml"
        )
        alias_provider = read_yaml(alias_provider_path)
        check(
            alias_provider == {"payload": list(expected_entries)},
            f"Compatibility provider differs from frozen subset: {alias_slug}",
        )
        check(
            file_sha256(alias_provider_path) == alias.provider_sha256,
            f"Compatibility provider hash differs: {alias_slug}",
        )
    check(total_rules > 0, "Generated rules are empty")
    return total_rules, destination_ip_rules


def expected_mihomo_provider(sources: ProfileSources, slug: str) -> dict[str, Any]:
    settings = sources.manifest["rule_provider"]
    return {
        "type": settings["type"],
        "behavior": settings["behavior"],
        "format": settings["format"],
        "url": f"{sources.manifest['urls']['providers_base']}/{slug}.yaml",
        "path": settings["path_template"].format(slug=slug),
        "interval": settings["interval"],
    }


def validate_mihomo_product(
    generated: Path, sources: ProfileSources, *, product: str, filename: str
) -> None:
    config = read_yaml(generated / "Mihomo" / filename)
    check(isinstance(config, dict), "Mihomo template must contain a mapping")
    expected_keys = [
        "proxy-providers",
        "proxy-groups",
        "rule-providers",
        "rules",
    ]
    check(list(config) == expected_keys, "Mihomo top-level fields or order differ")

    proxy_provider_source = sources.proxy_groups_document["proxy_provider"]
    expected_proxy_provider = {
        proxy_provider_source["name"]: {
            "type": proxy_provider_source["type"],
            "url": "PUT_YOUR_SUBSCRIPTION_URL_HERE",
            "path": proxy_provider_source["path"],
            "interval": proxy_provider_source["interval"],
        }
    }
    check(config["proxy-providers"] == expected_proxy_provider, "Mihomo proxy provider differs")

    expected_groups = [
        {
            "name": group.name,
            "type": group.type,
            "proxies": [member for member in group.members if member != NODE_PLACEHOLDER],
            "use": [proxy_provider_source["name"]],
        }
        for group in sources.proxy_groups_for(product)
    ]
    check(config["proxy-groups"] == expected_groups, "Mihomo proxy groups differ")

    product_segments = sources.rule_segments_for(product)
    expected_providers = {
        segment.slug: expected_mihomo_provider(sources, segment.slug)
        for segment in product_segments
    }
    check(config["rule-providers"] == expected_providers, "Mihomo rule providers differ")
    check(
        list(config["rule-providers"]) == [segment.slug for segment in product_segments],
        "Mihomo rule-provider order differs",
    )
    expected_rules = [
        f"RULE-SET,{segment.slug},{segment.target}"
        for segment in product_segments
    ] + [f"MATCH,{sources.terminal.target}"]
    check(config["rules"] == expected_rules, "Mihomo ordered rules differ")


def validate_analysis(generated: Path, sources: ProfileSources, total_rules: int) -> None:
    analysis = read_json(generated / "analysis.json")
    check(isinstance(analysis, dict), "analysis.json must contain an object")
    expected = build_analysis(sources)
    check(analysis == expected, "analysis.json differs from canonical computed analysis")
    check(
        expected["products"][CORE_PRODUCT]["summary"]["rule_count"]
        == total_rules + 1,
        "Computed rule count differs from generated rules",
    )
    baseline = sources.quality_baseline["products"][CORE_PRODUCT]
    check(
        scope_metrics(sources, product=CORE_PRODUCT) == baseline["scope"],
        "Canonical scope differs from the quality baseline",
    )
    check(
        coverage_metrics(sources, product=CORE_PRODUCT)
        == baseline["first_match_unreachable"],
        "Canonical coverage differs from the quality baseline",
    )


def collect_sensitive_keys(value: Any, *, path: str = "") -> list[str]:
    findings: list[str] = []
    if isinstance(value, dict):
        for key, child in value.items():
            key_text = str(key)
            child_path = f"{path}.{key_text}" if path else key_text
            if key_text.lower() in SENSITIVE_YAML_KEYS:
                findings.append(child_path)
            findings.extend(collect_sensitive_keys(child, path=child_path))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            findings.extend(collect_sensitive_keys(child, path=f"{path}[{index}]"))
    return findings


def validate_sensitive_content(generated: Path) -> None:
    generated_text_parts: list[str] = []
    for path in generated.rglob("*"):
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        generated_text_parts.append(text)
        if path.suffix.lower() in {".yaml", ".yml"}:
            data = read_yaml(path)
            findings = collect_sensitive_keys(data)
            check(not findings, f"Sensitive YAML keys found in {path}: {findings}")
    generated_text = "\n".join(generated_text_parts)
    check(UUID_PATTERN.search(generated_text) is None, "UUID-shaped credential found")
    check(
        KNOWN_CREDENTIAL_PATTERN.search(generated_text) is None,
        "Credential-shaped token found in generated products",
    )
    urls = re.findall(r"https://[^\s`\"'<>]+", generated_text)
    for index, url in enumerate(urls, start=1):
        try:
            validate_https_url(url.rstrip(".,);]"), context=f"generated URL {index}")
        except ProfileError as exc:
            raise ValidationError(str(exc)) from exc
    text_without_urls = re.sub(r"https://[^\s`\"'<>]+", "", generated_text)
    allowed_long_tokens = {
        match.group(0)
        for match in HIGH_ENTROPY_TOKEN.finditer(text_without_urls)
        if re.fullmatch(r"[0-9a-f]{64}", match.group(0))
    }
    suspicious = [
        match.group(0)
        for match in HIGH_ENTROPY_TOKEN.finditer(text_without_urls)
        if match.group(0) not in allowed_long_tokens
    ]
    check(not suspicious, "High-entropy credential-like text found in generated products")
    check(
        "PUT_YOUR_SUBSCRIPTION_URL_HERE" in generated_text,
        "Mihomo subscription placeholder is missing",
    )
    check(
        re.search(r"(?<![A-Za-z])[A-Za-z]:[\\/]", generated_text) is None,
        "Local absolute Windows path leaked into generated products",
    )
    check(
        POSIX_ABSOLUTE_PATH.search(generated_text) is None,
        "Local absolute POSIX path leaked into generated products",
    )


def validate_generation_check(sources: Path, generated: Path) -> None:
    command = [
        sys.executable,
        str(PROJECT_ROOT / "scripts" / "generate_profile.py"),
        "--sources",
        str(sources),
        "--output",
        str(generated),
        "--check",
    ]
    completed = subprocess.run(command, capture_output=True, text=True, encoding="utf-8")
    check(
        completed.returncode == 0,
        "Generation check failed:\n" + completed.stdout + completed.stderr,
    )
    try:
        result = json.loads(completed.stdout)
    except json.JSONDecodeError as exc:
        raise ValidationError("Generation check returned invalid JSON") from exc
    check(
        result.get("status") == "passed"
        and result.get("missing") == []
        and result.get("extra") == []
        and result.get("changed") == []
        and result.get("missing_directories") == []
        and result.get("extra_directories") == [],
        "Generation check reported differences",
    )


def main() -> int:
    args = parse_args()
    try:
        sources = load_profile_sources(args.sources)
    except (ProfileError, KeyError, TypeError) as exc:
        raise ValidationError(f"Canonical source validation failed: {exc}") from exc
    generated = args.generated.resolve()

    generated_manifest = validate_file_set(generated, sources)
    validate_ini_presets(generated, sources)
    total_rules, destination_ip_rules = validate_rulesets(generated, sources)
    validate_mihomo_product(
        generated,
        sources,
        product=CORE_PRODUCT,
        filename="reversed-template.yaml",
    )
    validate_analysis(generated, sources, total_rules)
    validate_sensitive_content(generated)
    if not args.skip_generation_check:
        validate_generation_check(args.sources.resolve(), generated)

    print(
        json.dumps(
            {
                "status": "passed",
                "product": {
                    "segments": len(sources.segments_for(CORE_PRODUCT)),
                    "rule_files": len(sources.rule_segments_for(CORE_PRODUCT)),
                    "proxy_groups": len(sources.proxy_groups_for(CORE_PRODUCT)),
                    "rules": build_analysis(sources)["products"][CORE_PRODUCT][
                        "summary"
                    ]["rule_count"],
                },
                "provider_files": len(sources.rule_segments)
                + sum(
                    metadata.canonical in sources.rules
                    for metadata in GENERATED_RULESET_ALIASES.values()
                ),
                "compatibility_aliases": sum(
                    metadata.canonical in sources.rules
                    for metadata in GENERATED_RULESET_ALIASES.values()
                ),
                "destination_ip_rules": destination_ip_rules,
                "destination_ip_rules_without_no_resolve": 0,
                "generated_manifest_hashes": len(generated_manifest["files"]),
                "generation_check": not args.skip_generation_check,
                "sensitive_values_found": 0,
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ValidationError as exc:
        print(f"validation failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
