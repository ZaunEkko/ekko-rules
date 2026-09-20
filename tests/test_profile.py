from __future__ import annotations

import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest import mock
from collections import Counter
from pathlib import Path
from typing import Any

import yaml


ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(ROOT / "scripts"))
import rule_evidence  # noqa: E402

SOURCES = ROOT / "sources"
EVIDENCE = ROOT / "docs" / "evidence"
ADMISSION_REVIEW = EVIDENCE / "admission-review-2026-09-19.json"
MAINLAND_AD_REVIEW = EVIDENCE / "cn-ad-review-2026-09-19.json"
LEGACY_AD_REVIEW = EVIDENCE / "legacy-ad-review-2026-09-19.json"
AD_ROOT_REVIEW = EVIDENCE / "ad-root-review-2026-09-19.json"
AD_SERVING_PROBE = EVIDENCE / "ad-serving-probe-2026-09-19.json"
CN_APNIC_VERDICTS = EVIDENCE / "cn-apnic-verdicts-2026-09-19.json"
CN_OBSERVATION = EVIDENCE / "cn-observation-2026-09-19.json"
CN_LEGACY_DIRECT = EVIDENCE / "cn-legacy-direct-2026-09-19.json"
ADS_TXT_EVIDENCE = EVIDENCE / "ads-txt-2026-09-19.json"
GENERATED = ROOT / "generated" / "reversed-profile"
PHASE_3_BEFORE = ROOT / "tests" / "fixtures" / "phase-3-before.json"
PHASE_3_AFTER = ROOT / "tests" / "fixtures" / "phase-3-after.json"
PHASE_3_DESIGN = ROOT / "tests" / "fixtures" / "phase-3-design.json"
PHASE_3_LEDGER = ROOT / "tests" / "fixtures" / "phase-3-migration-ledger.json"
PHASE_3_RECOVERY_LEDGER = (
    ROOT / "tests" / "fixtures" / "phase-3-recovery-ledger.json"
)
CLOUD_ROUTING_LEDGER = (
    ROOT / "tests" / "fixtures" / "cloud-routing-ledger.json"
)
PUBLIC_RULE_EXCLUSIONS = (
    ROOT / "tests" / "fixtures" / "public-rule-exclusions.json"
)
ISSUE_TEMPLATES = ROOT / ".github" / "ISSUE_TEMPLATE"
sys.path.insert(0, str(ROOT))

from scripts.profile_model import (  # noqa: E402
    GENERATED_RULESET_ALIASES,
    HistoricalRule,
    ProfileError,
    compare_trees,
    coverage_metrics,
    PRODUCTS,
    scope_metrics,
    build_analysis,
    first_match,
    load_profile_sources,
    parse_json_document,
    parse_rule,
    render_profile,
    rule_covers,
    select_late_recovery,
)


# The seven broad vendor roots sit in china-direct-curated rather than
# china-web, because they must not run ahead of the cloud, media and AI
# segments that name specific hosts beneath them.
BROAD_MAINLAND_ROOTS = frozenset(
    {
        "DOMAIN-SUFFIX,126.net",
        "DOMAIN-SUFFIX,163.com",
        "DOMAIN-SUFFIX,baidu.com",
        "DOMAIN-SUFFIX,netease.com",
        "DOMAIN-SUFFIX,qq.com",
        "DOMAIN-SUFFIX,tencent.com",
        "DOMAIN-SUFFIX,xiaomi.com",
    }
)


def mainland_slug(rule: str) -> str:
    return "china-direct-curated" if rule in BROAD_MAINLAND_ROOTS else "china-web"


class CommunityHealthTests(unittest.TestCase):
    def test_issue_forms_are_structured_and_safe(self) -> None:
        config = yaml.safe_load(
            (ISSUE_TEMPLATES / "config.yml").read_text(encoding="utf-8")
        )
        self.assertFalse(config["blank_issues_enabled"])
        self.assertEqual(len(config["contact_links"]), 2)

        expected = {
            "domain-addition.yml": "enhancement",
            "policy-group-change.yml": "enhancement",
            "routing-problem.yml": "bug",
        }
        sensitive_confirmation = (
            "我没有提交订阅 URL、token、UUID、密码、私钥、节点服务器/端口"
            "或完整客户端配置。"
        )
        for filename, label in expected.items():
            with self.subTest(filename=filename):
                document = yaml.safe_load(
                    (ISSUE_TEMPLATES / filename).read_text(encoding="utf-8")
                )
                self.assertTrue(document["name"])
                self.assertTrue(document["description"])
                self.assertEqual(document["labels"], [label])
                self.assertTrue(document["body"])
                ids = [item["id"] for item in document["body"] if "id" in item]
                self.assertEqual(len(ids), len(set(ids)))
                self.assertTrue(
                    all(
                        value.replace("-", "").replace("_", "").isalnum()
                        for value in ids
                    )
                )
                labels = [
                    option["label"]
                    for item in document["body"]
                    if item["type"] == "checkboxes"
                    for option in item["attributes"]["options"]
                ]
                self.assertIn(sensitive_confirmation, labels)

    def test_community_guides_and_templates_exist(self) -> None:
        required = [
            ROOT / "CONTRIBUTING.md",
            ROOT / "SUPPORT.md",
            ROOT / "SECURITY.md",
            ROOT / "CODE_OF_CONDUCT.md",
            ROOT / ".github" / "PULL_REQUEST_TEMPLATE.md",
        ]
        for path in required:
            with self.subTest(path=path.name):
                self.assertTrue(path.is_file())
                self.assertTrue(path.read_text(encoding="utf-8").strip())


class CanonicalSourceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.sources = load_profile_sources(SOURCES)

    def test_shape_and_order_snapshot(self) -> None:
        self.assertEqual(len(self.sources.segments), 64)
        self.assertEqual(len(self.sources.rule_segments), 63)
        # The raw list carries both products: 42 for the full one plus the two
        # groups only the lite product publishes.
        self.assertEqual(len(self.sources.proxy_groups), 45)
        self.assertEqual(len(self.sources.segments_for("core")), 64)
        self.assertEqual(len(self.sources.rule_segments_for("core")), 63)
        self.assertEqual(len(self.sources.proxy_groups_for("core")), 43)
        self.assertEqual(self.sources.terminal.slug, "final")
        self.assertEqual(self.sources.terminal.target, "🐟 漏网之鱼")
        self.assertNotIn(
            "health_check",
            self.sources.proxy_groups_document["proxy_provider"],
        )
        self.assertEqual(
            [group.name for group in self.sources.proxy_groups_for("core")],
            [
                "♻️ 手动切换",
                "🛑 广告拦截",
                "🧲 OpenAI",
                "🧲 Claude",
                "🧲 海外 AI",
                "🔎 Google",
                "🗣 社交媒体",
                "📲 聊天软件",
                "🎙 Discord",
                "🖥️ 远程串流后台",
                "🖥️ 远程串流流量",
                "🧑‍💻 开发服务",
                "🎬 YouTube",
                "🎬 Netflix",
                "🎬 DisneyPlus",
                "🎬 港澳台媒体",
                "🎬 日本媒体",
                "🎬 韩国媒体",
                "🎬 AppleTV+",
                "🎬 HBO GO/MAX",
                "🎬 PrimeVideo",
                "🎬 Dazn",
                "🎶 TikTok",
                "🎵 音乐平台",
                "🎬 爱奇艺国际",
                "🎬 B站港澳台",
                "🎬 东南亚媒体",
                "🎬 美国流媒体",
                "🌏 国外流媒体",
                "🌏 国内流媒体",
                "☁️ 云盘服务",
                "☁️ 国内云服务",
                "☁️ 海外云服务",
                "🧩 微软服务",
                "🍎 苹果服务",
                "🎮 游戏平台",
                "🎮 游戏下载",
                "📪 邮件服务",
                "🛒 海外购物",
                "💳 金融服务",
                "🔞 NSFW",
                "🌏 国内网站",
                "🐟 漏网之鱼",
            ],
        )
        self.assertEqual(
            list(self.sources.proxy_groups[-1].members),
            ["♻️ 手动切换", "DIRECT", "__ALL_SUBSCRIPTION_NODES__"],
        )
        for group_name in ["🛑 广告拦截", "🔞 NSFW"]:
            group = next(
                group for group in self.sources.proxy_groups if group.name == group_name
            )
            self.assertEqual(
                list(group.members),
                ["REJECT", "♻️ 手动切换", "DIRECT", "__ALL_SUBSCRIPTION_NODES__"],
            )
        expected_group_members = {
            "🖥️ 远程串流流量": [
                "DIRECT",
                "♻️ 手动切换",
                "__ALL_SUBSCRIPTION_NODES__",
            ],
            "🧑‍💻 开发服务": [
                "♻️ 手动切换",
                "DIRECT",
                "__ALL_SUBSCRIPTION_NODES__",
            ],
            "☁️ 国内云服务": [
                "DIRECT",
                "♻️ 手动切换",
                "__ALL_SUBSCRIPTION_NODES__",
            ],
            "☁️ 海外云服务": [
                "♻️ 手动切换",
                "DIRECT",
                "__ALL_SUBSCRIPTION_NODES__",
            ],
            "🧩 微软服务": [
                "♻️ 手动切换",
                "DIRECT",
                "__ALL_SUBSCRIPTION_NODES__",
            ],
            "🍎 苹果服务": [
                "♻️ 手动切换",
                "DIRECT",
                "__ALL_SUBSCRIPTION_NODES__",
            ],
            "🎮 游戏平台": [
                "♻️ 手动切换",
                "DIRECT",
                "__ALL_SUBSCRIPTION_NODES__",
            ],
            "🎮 游戏下载": [
                "DIRECT",
                "♻️ 手动切换",
                "__ALL_SUBSCRIPTION_NODES__",
            ],
        }
        for group_name, expected_members in expected_group_members.items():
            group = next(
                group for group in self.sources.proxy_groups if group.name == group_name
            )
            self.assertEqual(list(group.members), expected_members)
        self.assertEqual(
            [segment.slug for segment in self.sources.segments[:5]],
            [
                "author-domain",
                "private",
                "remote-streaming-admin",
                "remote-streaming",
                "advertising-curated",
            ],
        )
        self.assertFalse((SOURCES / "rules" / "direct-override.list").exists())
        self.assertEqual(
            [
                segment.slug
                for segment in self.sources.segments
                if segment.target == "🎵 音乐平台"
            ],
            [
                "tidal",
                "spotify",
                "qobuz",
                "apple-music",
            ],
        )
        self.assertEqual(
            [
                segment.slug
                for segment in self.sources.segments
                if segment.target == "☁️ 云盘服务"
            ],
            ["cloud-storage"],
        )
        self.assertEqual(
            [
                segment.slug
                for segment in self.sources.segments
                if segment.target == "🎬 HBO GO/MAX"
            ],
            ["hbo-go"],
        )
        self.assertEqual(
            [
                segment.slug
                for segment in self.sources.segments
                if segment.target == "🎬 Dazn"
            ],
            ["dazn"],
        )
        slugs = [segment.slug for segment in self.sources.segments]
        self.assertLess(slugs.index("advertising-curated"), slugs.index("overseas-cloud"))
        self.assertLess(slugs.index("china-media-late-recovery"), slugs.index("overseas-cloud"))
        self.assertLess(slugs.index("overseas-cloud"), slugs.index("china-cloud"))
        self.assertLess(slugs.index("china-cloud"), slugs.index("microsoft"))
        self.assertLess(slugs.index("microsoft-late-recovery"), slugs.index("google"))
        self.assertLess(slugs.index("google"), slugs.index("china-direct-curated"))

    def test_cloud_capture_ledger_is_frozen_and_closed(self) -> None:
        ledger = json.loads(CLOUD_ROUTING_LEDGER.read_text(encoding="utf-8"))
        self.assertEqual(ledger["schema_version"], 1)
        self.assertEqual(ledger["count"], 19)
        content = "".join(
            "\t".join(
                (
                    row["cloud_slug"],
                    row["cloud_target"],
                    row["cloud_rule"],
                    row["later_slug"],
                    row["later_target"],
                    row["later_rule"],
                )
            )
            + "\n"
            for row in ledger["rows"]
        )
        self.assertEqual(
            hashlib.sha256(content.encode()).hexdigest(),
            ledger["rows_sha256"],
        )

        segments = list(self.sources.rule_segments)
        actual: list[dict[str, str]] = []
        for later_index, later in enumerate(segments):
            if later.slug in {"overseas-cloud", "china-cloud"}:
                continue
            for later_rule in self.sources.rules[later.slug]:
                capture: tuple[Any, str] | None = None
                for earlier in segments[:later_index]:
                    if earlier.slug not in {"overseas-cloud", "china-cloud"}:
                        continue
                    for cloud_rule in self.sources.rules[earlier.slug]:
                        if rule_covers(cloud_rule, later_rule):
                            capture = (earlier, cloud_rule)
                            break
                    if capture is not None:
                        break
                if capture is not None:
                    earlier, cloud_rule = capture
                    actual.append(
                        {
                            "cloud_slug": earlier.slug,
                            "cloud_target": earlier.target,
                            "cloud_rule": cloud_rule,
                            "later_slug": later.slug,
                            "later_target": later.target,
                            "later_rule": later_rule,
                        }
                    )
        self.assertEqual(actual, ledger["rows"])
        self.assertEqual(
            Counter(row["cloud_slug"] for row in actual),
            Counter({"china-cloud": 12, "overseas-cloud": 7}),
        )
        self.assertEqual(
            Counter(row["later_slug"] for row in actual),
            Counter({"microsoft-late-recovery": 19}),
        )

    def test_no_resolve_and_strict_cidr_gate(self) -> None:
        self.assertEqual(
            self.sources.quality_baseline["products"]["core"]["scope"][
                "destination_ip_rules_without_no_resolve"
            ],
            0,
        )
        strict_cidr = self.sources.quality_baseline["known_non_strict_cidrs"]
        self.assertEqual(strict_cidr["entries"], [])
        self.assertEqual(strict_cidr["previous_bootstrap_entries_removed"], 5)

    def test_exact_duplicates_are_removed_within_segments(self) -> None:
        baseline = self.sources.quality_baseline["exact_duplicates_within_segment"]
        self.assertEqual(baseline["occurrences_beyond_first"], 0)
        self.assertEqual(baseline["duplicate_keys"], 0)
        self.assertEqual(baseline["by_slug"], {})
        self.assertEqual(baseline["previous_bootstrap_occurrences_removed"], 143)

    def test_first_match_coverage_metrics_are_frozen(self) -> None:
        baseline = self.sources.quality_baseline["products"]["core"][
            "first_match_unreachable"
        ]
        current = coverage_metrics(self.sources, product="core")
        self.assertEqual(current, baseline)
        self.assertEqual(current["global"]["union"], 54)
        self.assertEqual(current["within_same_segment"]["union"], 13)
        self.assertEqual(current["cross_segment_only"]["union"], 41)

    def test_direct_default_domain_keyword_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            source_copy = Path(temporary) / "sources"
            shutil.copytree(SOURCES, source_copy)
            # china-web targets the default-DIRECT mainland group. Microsoft
            # used to serve as the example here, but ER-031 moved it to the
            # manual group, where an unanchored matcher is not a leak.
            china_web = source_copy / "rules" / "china-web.list"
            china_web.write_text(
                china_web.read_text(encoding="utf-8")
                + "DOMAIN-KEYWORD,weibo\n",
                encoding="utf-8",
                newline="\n",
            )
            with self.assertRaisesRegex(
                ProfileError,
                "DIRECT-default rules must use anchored domain matchers",
            ):
                load_profile_sources(source_copy)

    def test_public_review_date_is_required(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            source_copy = Path(temporary) / "sources"
            shutil.copytree(SOURCES, source_copy)
            review = source_copy / "review.yaml"
            review_document = yaml.safe_load(review.read_text(encoding="utf-8"))
            review.write_text(
                review.read_text(encoding="utf-8").replace(
                    f"reviewed_on: {review_document['reviewed_on'].isoformat()}",
                    "reviewed_on: null",
                    1,
                ),
                encoding="utf-8",
                newline="\n",
            )
            with self.assertRaisesRegex(ProfileError, "reviewed_on must be a date"):
                load_profile_sources(source_copy)

    def test_undeclared_review_status_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            source_copy = Path(temporary) / "sources"
            shutil.copytree(SOURCES, source_copy)
            review = source_copy / "review.yaml"
            review.write_text(
                review.read_text(encoding="utf-8").replace(
                    "status: accepted", "status: undeclared", 1
                ),
                encoding="utf-8",
                newline="\n",
            )
            with self.assertRaisesRegex(ProfileError, "uses undeclared status"):
                load_profile_sources(source_copy)

    def test_sensitive_or_nonportable_source_fields_are_rejected(self) -> None:
        mutations = [
            ("manifest.yaml", "https://raw.githubusercontent.com/", "https://user:secret@raw.githubusercontent.com/"),
            ("manifest.yaml", "/Ruleset", "/Ruleset?X-Amz-Signature=secret"),
            ("proxy-groups.yaml", "path: ./proxy_provider/subscription.yaml", "path: /home/alice/private-subscription.yaml"),
            ("proxy-groups.yaml", "url: PUT_YOUR_SUBSCRIPTION_URL_HERE", "url: https://example.com/subscription?X-Amz-Signature=secret"),
        ]
        for filename, old, new in mutations:
            with self.subTest(filename=filename), tempfile.TemporaryDirectory() as temporary:
                source_copy = Path(temporary) / "sources"
                shutil.copytree(SOURCES, source_copy)
                path = source_copy / filename
                path.write_text(
                    path.read_text(encoding="utf-8").replace(old, new, 1),
                    encoding="utf-8",
                    newline="\n",
                )
                with self.assertRaises(ProfileError):
                    load_profile_sources(source_copy)


class PhaseThreeMigrationBaselineTests(unittest.TestCase):
    def test_pre_migration_fixture_is_complete_and_immutable(self) -> None:
        fixture = json.loads(PHASE_3_BEFORE.read_text(encoding="utf-8"))
        self.assertEqual(fixture["schema_version"], 1)
        self.assertEqual(fixture["baseline"], "phase-3-pre-migration")
        self.assertEqual(
            hashlib.sha256(PHASE_3_BEFORE.read_bytes()).hexdigest(),
            "33ac7732a33f11d79b1501e21e418547b5ef6ce910ecf09d6833517f37941dab",
        )
        self.assertEqual(
            fixture["head"],
            "8dbf3e6f7c2aedfa0fd9c485f63d76c1ace31faf",
        )
        self.assertEqual(len(fixture["rule_files"]), 57)
        self.assertEqual(len(fixture["segment_order"]), 58)
        self.assertEqual(len(fixture["proxy_group_order"]), 45)
        self.assertEqual(
            fixture["products"]["core"]["scope"]["rules_in_files"],
            15411,
        )
        self.assertEqual(
            fixture["products"]["extended"]["scope"]["rules_in_files"],
            15517,
        )
        for product in ("core", "extended"):
            self.assertEqual(
                fixture["products"][product]["scope"][
                    "destination_ip_rules_without_no_resolve"
                ],
                0,
            )

    def test_frozen_design_is_self_consistent_and_immutable(self) -> None:
        design = json.loads(PHASE_3_DESIGN.read_text(encoding="utf-8"))
        self.assertEqual(design["schema_version"], 1)
        self.assertEqual(design["phase"], "phase-3-specialization")
        self.assertEqual(
            hashlib.sha256(PHASE_3_DESIGN.read_bytes()).hexdigest(),
            "0258d0fe4d7a5ac29929fee408dd6ddadf12f8f017ab8c5879b3dc6916ea0505",
        )
        core_groups = design["core_group_order"]
        self.assertEqual(len(core_groups), 37)
        self.assertEqual(len(core_groups), len(set(core_groups)))
        self.assertEqual(design["products"]["core"]["proxy_groups"], 37)
        self.assertEqual(design["products"]["extended"]["proxy_groups"], 38)
        self.assertIn("🎬 B站港澳台", core_groups)
        self.assertIn("🔞 NSFW", core_groups)
        self.assertIn("🌐 海外 AI", core_groups)
        self.assertNotIn("🌏 学术网站", core_groups)
        self.assertNotIn("🌏 国外网站", core_groups)
        self.assertEqual(
            design["segments"]["delete"],
            [
                "academic",
                "community-overrides",
                "global-web",
                "streaming-legacy",
                "yahoo",
            ],
        )
        self.assertEqual(
            design["final_group_members"],
            [
                "♻️ 手动切换",
                "DIRECT",
                "__ALL_SUBSCRIPTION_NODES__",
            ],
        )
        self.assertEqual(
            set(design["destination_ip_rule_types"]),
            {"IP-CIDR", "IP-CIDR6", "IP-SUFFIX", "IP-ASN", "GEOIP"},
        )

    def test_post_reduction_fixture_is_complete_and_immutable(self) -> None:
        fixture = json.loads(PHASE_3_AFTER.read_text(encoding="utf-8"))
        self.assertEqual(fixture["schema_version"], 1)
        self.assertEqual(
            fixture["baseline"],
            "phase-3-post-reduction-pre-recovery",
        )
        self.assertEqual(
            hashlib.sha256(PHASE_3_AFTER.read_bytes()).hexdigest(),
            "856f4e3623f487107837eb27943ea772c408b4b13c5baed0d48b347e81cf1584",
        )
        self.assertEqual(len(fixture["rule_files"]), 58)
        self.assertEqual(len(fixture["segment_order"]), 59)
        self.assertEqual(len(fixture["proxy_group_order"]), 38)
        self.assertEqual(
            fixture["products"]["core"]["scope"]["rules_in_files"],
            1517,
        )
        self.assertEqual(
            fixture["products"]["extended"]["scope"]["rules_in_files"],
            1615,
        )
        self.assertEqual(fixture["extended_counter"]["occurrences"], 1615)
        self.assertEqual(fixture["extended_counter"]["unique_rules"], 1594)

    def test_migration_counter_is_closed_and_immutable(self) -> None:
        ledger = json.loads(PHASE_3_LEDGER.read_text(encoding="utf-8"))
        self.assertEqual(
            hashlib.sha256(PHASE_3_LEDGER.read_bytes()).hexdigest(),
            "b8669022c7c1beaa43412a7d6974da565b6c2baa4d77fd1c714a75e31aa39d85",
        )
        before = json.loads(PHASE_3_BEFORE.read_text(encoding="utf-8"))

        old_rules: list[str] = []
        for filename in sorted(before["rule_files"]):
            completed = subprocess.run(
                [
                    "git",
                    "show",
                    f"{ledger['baseline_head']}:sources/rules/{filename}",
                ],
                capture_output=True,
                text=True,
                encoding="utf-8",
            )
            self.assertEqual(completed.returncode, 0, completed.stderr)
            old_rules.extend(completed.stdout.splitlines())

        after = json.loads(PHASE_3_AFTER.read_text(encoding="utf-8"))
        new_rules = [
            rule
            for segment in after["segment_order"]
            if segment["kind"] == "ruleset"
            for rule in after["rule_files"][f"{segment['slug']}.list"]["entries"]
        ]
        old_counter = Counter(old_rules)
        new_counter = Counter(new_rules)
        kept = old_counter & new_counter
        removed = old_counter - new_counter
        added = new_counter - old_counter

        def counter_digest(counter: Counter[str]) -> str:
            content = "".join(
                f"{rule}\t{counter[rule]}\n" for rule in sorted(counter)
            )
            return hashlib.sha256(content.encode()).hexdigest()

        self.assertEqual(sum(old_counter.values()), ledger["old_extended_rules"])
        self.assertEqual(sum(new_counter.values()), ledger["new_extended_rules"])
        self.assertEqual(sum(kept.values()), ledger["kept_occurrences"])
        self.assertEqual(sum(removed.values()), ledger["removed_occurrences"])
        self.assertEqual(sum(added.values()), ledger["added_occurrences"])
        self.assertEqual(old_counter, kept + removed)
        self.assertEqual(new_counter, kept + added)
        self.assertEqual(counter_digest(kept), ledger["counter_digests"]["kept"])
        self.assertEqual(
            counter_digest(removed),
            ledger["counter_digests"]["removed"],
        )
        self.assertEqual(counter_digest(added), ledger["counter_digests"]["added"])


class PhaseThreeDirectRecoveryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.ledger = json.loads(
            PHASE_3_RECOVERY_LEDGER.read_text(encoding="utf-8")
        )
        cls.after = json.loads(PHASE_3_AFTER.read_text(encoding="utf-8"))
        cls.historical_manifest = cls._git_yaml(
            cls.ledger["baseline_head"],
            "sources/manifest.yaml",
        )
        cls.historical_groups = cls._git_yaml(
            cls.ledger["baseline_head"],
            "sources/proxy-groups.yaml",
        )
        cls.current_rules = [
            rule
            for segment in cls.after["segment_order"]
            if segment["kind"] == "ruleset"
            for rule in cls.after["rule_files"][f"{segment['slug']}.list"]["entries"]
        ]
        cls.historical_rules = [
            HistoricalRule(segment["slug"], segment["target"], rule)
            for segment in cls.historical_manifest["segments"]
            if segment["kind"] == "ruleset"
            for rule in cls._git_text(
                cls.ledger["baseline_head"],
                f"sources/{segment['source']}",
            ).splitlines()
        ]
        cls.direct_default_targets = {"DIRECT"} | {
            group["name"]
            for group in cls.historical_groups["groups"]
            if group["members"][0] == "DIRECT"
        }
        cls.selection = select_late_recovery(
            cls.historical_rules,
            direct_default_targets=cls.direct_default_targets,
            current_rules=cls.current_rules,
        )

    @staticmethod
    def _git_text(head: str, path: str) -> str:
        completed = subprocess.run(
            ["git", "show", f"{head}:{path}"],
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
        if completed.returncode != 0:
            raise AssertionError(completed.stderr)
        return completed.stdout

    @classmethod
    def _git_yaml(cls, head: str, path: str) -> dict[str, Any]:
        data = yaml.safe_load(cls._git_text(head, path))
        if not isinstance(data, dict):
            raise AssertionError(f"Historical YAML is not a mapping: {path}")
        return data

    @staticmethod
    def _rows_digest(rows: tuple[HistoricalRule, ...]) -> str:
        content = "".join(
            f"{item.slug}\t{item.target}\t{item.rule}\n" for item in rows
        )
        return hashlib.sha256(content.encode()).hexdigest()

    def test_recovery_ledger_is_closed_and_immutable(self) -> None:
        self.assertEqual(
            hashlib.sha256(PHASE_3_RECOVERY_LEDGER.read_bytes()).hexdigest(),
            "6be20b183cb0c4ff38809a35b318349a2b28b6b00d343229a6a838663c016715",
        )
        self.assertEqual(
            self.ledger["phase_3_after_sha256"],
            hashlib.sha256(PHASE_3_AFTER.read_bytes()).hexdigest(),
        )
        categories = (
            "historical_direct_default",
            "explicitly_covered",
            "raw_residual",
            "historical_shadowed",
            "selected",
            "security_excluded",
            "security_replacements",
            "emitted",
            "proxy_residual",
            "proxy_capture_violations",
        )
        for category in categories:
            rows = getattr(self.selection, category)
            self.assertEqual(len(rows), self.ledger["counts"][category])
            if category in self.ledger["digests"]:
                self.assertEqual(
                    self._rows_digest(rows),
                    self.ledger["digests"][category],
                )
        self.assertEqual(
            len(self.selection.historical_direct_default),
            len(self.selection.explicitly_covered)
            + len(self.selection.raw_residual),
        )
        self.assertEqual(
            len(self.selection.raw_residual),
            len(self.selection.selected)
            + len(self.selection.historical_shadowed),
        )
        self.assertEqual(self.selection.proxy_capture_violations, ())
        self.assertEqual(
            [item.rule for item in self.selection.security_excluded],
            [
                "DOMAIN-KEYWORD,epicgames",
                "DOMAIN-KEYWORD,steambroadcast",
                "DOMAIN-KEYWORD,steamstore",
                "DOMAIN-KEYWORD,steamuserimages",
                "DOMAIN-KEYWORD,roblox",
                "DOMAIN-KEYWORD,qiyi",
                "DOMAIN-KEYWORD,bilibili",
            ],
        )
        self.assertEqual(
            [item.rule for item in self.selection.security_replacements],
            ["DOMAIN-SUFFIX,roblox.com", "DOMAIN-SUFFIX,rbxcdn.com"],
        )
        self.assertTrue(
            all(
                parse_rule(item.rule, context="recovery security test")[0]
                != "DOMAIN-KEYWORD"
                for item in self.selection.emitted
            )
        )

    def test_recovery_files_match_filtered_history(self) -> None:
        emitted_by_owner: dict[str, list[str]] = {}
        for item in self.selection.emitted:
            emitted_by_owner.setdefault(item.slug, []).append(item.rule)
        public_exclusions = json.loads(
            PUBLIC_RULE_EXCLUSIONS.read_text(encoding="utf-8")
        )
        excluded_by_slug: dict[str, set[str]] = {}
        for item in public_exclusions["removed"]["late_recovery"]:
            excluded_by_slug.setdefault(item["recovery_slug"], set()).add(item["rule"])
        for item in public_exclusions.get("reassigned", []):
            excluded_by_slug.setdefault(item["recovery_slug"], set()).update(
                item["rules"]
            )

        for owner, record in self.ledger["owners"].items():
            rules = [
                rule
                for rule in emitted_by_owner[owner]
                if rule not in excluded_by_slug.get(record["recovery_slug"], set())
            ]
            path = SOURCES / "rules" / f"{record['recovery_slug']}.list"
            self.assertEqual(path.read_text(encoding="utf-8").splitlines(), rules)
            current = public_exclusions["current_recovery_files"].get(
                record["recovery_slug"], record
            )
            self.assertEqual(len(rules), current["rules"])
            self.assertEqual(
                hashlib.sha256(path.read_bytes()).hexdigest(),
                current["sha256"] if "sha256" in current else current["file_sha256"],
            )

        destination_rules = [
            item.rule
            for item in self.selection.emitted
            if parse_rule(item.rule, context="recovery test")[0]
            in {"IP-CIDR", "IP-CIDR6", "IP-SUFFIX", "IP-ASN", "GEOIP"}
        ]
        self.assertEqual(
            len(destination_rules),
            self.ledger["destination_ip_rules"]["count"],
        )
        self.assertTrue(
            all(
                parse_rule(rule, context="recovery test")[2]
                for rule in destination_rules
            )
        )

    def test_recovery_tail_and_default_groups_are_frozen(self) -> None:
        sources = load_profile_sources(SOURCES)
        slugs = [segment.slug for segment in sources.segments]
        recovery_slugs = self.ledger["tail_order"][1:-1]
        self.assertEqual(
            set(recovery_slugs),
            {
                "game-platform-late-recovery",
                "bilibili-hmt-late-recovery",
                "iqiyi-late-recovery",
                "microsoft-late-recovery",
                "apple-late-recovery",
                "china-media-late-recovery",
            },
        )
        self.assertTrue(all(slug in slugs for slug in recovery_slugs))
        for slug in recovery_slugs:
            self.assertLess(slugs.index("china-web"), slugs.index(slug))
            self.assertLess(slugs.index(slug), slugs.index("china-direct-curated"))
        for slug in recovery_slugs:
            if slug != "microsoft-late-recovery":
                self.assertLess(slugs.index(slug), slugs.index("overseas-cloud"))
        self.assertLess(slugs.index("microsoft"), slugs.index("microsoft-late-recovery"))
        self.assertLess(slugs.index("microsoft-late-recovery"), slugs.index("google"))
        self.assertEqual(
            slugs[-3:],
            ["china-direct-curated", "china-geoip-direct", "final"],
        )
        group_members = {
            group.name: list(group.members) for group in sources.proxy_groups
        }
        # The recovery rulesets were restored to keep historical DIRECT-default
        # behaviour. Microsoft and Apple were later moved to the manual group
        # on purpose (ER-031), so their owners now lead with it too.
        proxy_first_targets = {
            "🎮 游戏平台",
            "🧩 微软服务",
            "🍎 苹果服务",
        }
        # The recovery ledger is immutable, so a group renamed after it was
        # sealed is mapped here instead of being edited into the ledger.
        renamed_targets = {"🎬 爱奇艺": "🎬 爱奇艺国际"}
        for record in self.ledger["owners"].values():
            target = renamed_targets.get(record["target"], record["target"])
            expected_default = (
                "♻️ 手动切换"
                if target in proxy_first_targets
                else "DIRECT"
            )
            self.assertEqual(group_members[target][0], expected_default)
        self.assertEqual(
            group_members["🐟 漏网之鱼"],
            ["♻️ 手动切换", "DIRECT", "__ALL_SUBSCRIPTION_NODES__"],
        )
        china_web = next(
            segment for segment in sources.segments if segment.slug == "china-web"
        )
        china_geoip = next(
            segment
            for segment in sources.segments
            if segment.slug == "china-geoip-direct"
        )
        self.assertNotIn("GEOIP,CN,no-resolve", sources.rules[china_web.slug])
        self.assertEqual(china_geoip.target, "DIRECT")
        self.assertEqual(sources.rules[china_geoip.slug], ("GEOIP,CN,no-resolve",))
        self.assertEqual(
            f"GEOIP,CN,{china_geoip.target},no-resolve",
            "GEOIP,CN,DIRECT,no-resolve",
        )
        self.assertIn(
            "ruleset=DIRECT,https://raw.githubusercontent.com/ZaunEkko/ekko-rules/"
            "main/generated/reversed-profile/Ruleset/china-geoip-direct.list",
            (GENERATED / "config" / "ekko-rules.ini").read_text(encoding="utf-8"),
        )
        mihomo = yaml.safe_load(
            (GENERATED / "Mihomo" / "reversed-template.yaml").read_text(
                encoding="utf-8"
            )
        )
        mihomo_groups = {
            group["name"]: group["proxies"] for group in mihomo["proxy-groups"]
        }
        for group_name in ["🛑 广告拦截", "🔞 NSFW"]:
            self.assertEqual(
                mihomo_groups[group_name][:3],
                ["REJECT", "♻️ 手动切换", "DIRECT"],
            )
        self.assertEqual(
            mihomo_groups["🖥️ 远程串流流量"][:2],
            ["DIRECT", "♻️ 手动切换"],
        )
        self.assertEqual(
            mihomo_groups["🧑‍💻 开发服务"][:2],
            ["♻️ 手动切换", "DIRECT"],
        )
        self.assertEqual(
            mihomo_groups["🎮 游戏平台"][:2],
            ["♻️ 手动切换", "DIRECT"],
        )
        self.assertEqual(
            mihomo_groups["🎮 游戏下载"][:2],
            ["DIRECT", "♻️ 手动切换"],
        )
        subconverter = (
            GENERATED / "config" / "ekko-rules.ini"
        ).read_text(encoding="utf-8")
        for group_name in ["🛑 广告拦截", "🔞 NSFW"]:
            self.assertIn(
                f"custom_proxy_group={group_name}`select`[]REJECT`"
                "[]♻️ 手动切换`[]DIRECT`",
                subconverter,
            )
        # The split is visible in the published config: the admin console group
        # leads with the manual selector and the data group leads with DIRECT.
        self.assertIn(
            "custom_proxy_group=🖥️ 远程串流后台`select`[]♻️ 手动切换`"
            "[]DIRECT`",
            subconverter,
        )
        self.assertIn(
            "custom_proxy_group=🖥️ 远程串流流量`select`[]DIRECT`"
            "[]♻️ 手动切换`",
            subconverter,
        )
        self.assertIn(
            "custom_proxy_group=🧑‍💻 开发服务`select`[]♻️ 手动切换`"
            "[]DIRECT`",
            subconverter,
        )
        self.assertIn(
            "custom_proxy_group=🎮 游戏平台`select`[]♻️ 手动切换`"
            "[]DIRECT`",
            subconverter,
        )
        self.assertIn(
            "custom_proxy_group=🎮 游戏下载`select`[]DIRECT`"
            "[]♻️ 手动切换`",
            subconverter,
        )
        self.assertIn(
            "ruleset=🖥️ 远程串流流量,https://raw.githubusercontent.com/"
            "ZaunEkko/ekko-rules/main/generated/reversed-profile/Ruleset/"
            "remote-streaming.list",
            subconverter,
        )
        self.assertEqual(
            mihomo["rules"][-3:],
            [
                "RULE-SET,china-direct-curated,🌏 国内网站",
                "RULE-SET,china-geoip-direct,DIRECT",
                "MATCH,🐟 漏网之鱼",
            ],
        )


class PublicRuleExclusionTests(unittest.TestCase):
    def test_exclusion_ledger_is_immutable_and_closed(self) -> None:
        self.assertEqual(
            hashlib.sha256(PUBLIC_RULE_EXCLUSIONS.read_bytes()).hexdigest(),
            "2ff918c099c39c51fcc75cde58b6d770ce963cea81acf819ea081bbe99fbbd1c",
        )
        ledger = json.loads(PUBLIC_RULE_EXCLUSIONS.read_text(encoding="utf-8"))
        removed = [
            *ledger["removed"]["provider_override"],
            *ledger["removed"]["late_recovery"],
        ]
        reassigned = [
            (record, rule)
            for record in ledger.get("reassigned", [])
            for rule in record["rules"]
        ]
        self.assertEqual(
            len(removed),
            ledger["counts"]["provider_override"]
            + ledger["counts"]["late_recovery"],
        )
        self.assertEqual(len(reassigned), ledger["counts"]["reassigned"])
        self.assertEqual(
            len(removed) + len(reassigned),
            ledger["counts"]["total"],
        )
        current_text = "\n".join(
            path.read_text(encoding="utf-8")
            for path in (SOURCES / "rules").glob("*.list")
        )
        sources = load_profile_sources(SOURCES)
        for record in removed:
            with self.subTest(rule=record["rule"]):
                self.assertNotIn(record["rule"], current_text)
                domain = record["rule"].split(",", 1)[1]
                self.assertEqual(
                    first_match(sources, domain=domain),
                    {"slug": "final", "target": "🐟 漏网之鱼", "rule": "MATCH"},
                )

        for record, rule in reassigned:
            with self.subTest(reassigned_rule=rule):
                self.assertIn(rule, current_text)
                domain = rule.split(",", 1)[1]
                self.assertEqual(
                    first_match(sources, domain=domain),
                    {
                        "slug": record["new_slug"],
                        "target": record["new_target"],
                        "rule": rule,
                    },
                )

        for slug, expected in ledger["current_recovery_files"].items():
            path = SOURCES / "rules" / f"{slug}.list"
            self.assertEqual(
                len(path.read_text(encoding="utf-8").splitlines()),
                expected["rules"],
            )
            self.assertEqual(
                hashlib.sha256(path.read_bytes()).hexdigest(),
                expected["sha256"],
            )

    def test_provider_override_now_falls_to_final(self) -> None:
        sources = load_profile_sources(SOURCES)
        result = first_match(sources, domain="huaikhwang.central-world.org")
        self.assertEqual(result, {"slug": "final", "target": "🐟 漏网之鱼", "rule": "MATCH"})


class FirstMatchBaselineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.sources = load_profile_sources(SOURCES)

    def assert_match(
        self,
        expected: tuple[str, str, str],
        *,
        domain: str | None = None,
        ip: str | None = None,
        process_name: str | None = None,
    ) -> None:
        result = first_match(
            self.sources,
            domain=domain,
            ip=ip,
            process_name=process_name,
        )
        self.assertEqual(
            (result["slug"], result["target"], result["rule"]), expected
        )

    def test_generic_domains_fall_back_to_final(self) -> None:
        cases = [
            (("final", "🐟 漏网之鱼", "MATCH"), "example.jp"),
            (("final", "🐟 漏网之鱼", "MATCH"), "example.kr"),
            (("final", "🐟 漏网之鱼", "MATCH"), "blackfridaysale.example"),
            (("final", "🐟 漏网之鱼", "MATCH"), "unrelated-ntt.example"),
            (("final", "🐟 漏网之鱼", "MATCH"), "mail.hinet.net"),
            (("google", "🔎 Google", "DOMAIN-SUFFIX,gvt1.com"), "download.gvt1.com"),
            (("final", "🐟 漏网之鱼", "MATCH"), "app.sentry.io"),
            (("final", "🐟 漏网之鱼", "MATCH"), "workspace.notion.site"),
            (("final", "🐟 漏网之鱼", "MATCH"), "players.brightcove.net"),
        ]
        for expected, domain in cases:
            with self.subTest(domain=domain):
                self.assert_match(expected, domain=domain)

    def test_shared_cloud_cidrs_fall_back_to_final(self) -> None:
        cases = [
            (("final", "🐟 漏网之鱼", "MATCH"), "18.194.1.1"),
            (("final", "🐟 漏网之鱼", "MATCH"), "34.224.1.1"),
            (("final", "🐟 漏网之鱼", "MATCH"), "54.242.1.1"),
            (("final", "🐟 漏网之鱼", "MATCH"), "35.192.1.1"),
        ]
        for expected, ip in cases:
            with self.subTest(ip=ip):
                self.assert_match(expected, ip=ip)

    def test_specific_services_and_final_are_preserved(self) -> None:
        cases = [
            (
                ("claude", "🧲 Claude", "DOMAIN-SUFFIX,anthropic.com"),
                "api.anthropic.com",
            ),
            (
                ("media-taiwan", "🎬 港澳台媒体", "DOMAIN-SUFFIX,friday.tw"),
                "video.friday.tw",
            ),
            (
                ("media-taiwan", "🎬 港澳台媒体", "DOMAIN,theater-kktv.cdn.hinet.net"),
                "theater-kktv.cdn.hinet.net",
            ),
            (
                ("google", "🔎 Google", "DOMAIN-SUFFIX,gvt1.com"),
                "redirector.gvt1.com",
            ),
            (
                ("netflix", "🎬 Netflix", "DOMAIN-SUFFIX,netflix.com"),
                "www.netflix.com",
            ),
            (
                ("google-ai", "🧲 海外 AI", "DOMAIN-SUFFIX,gemini.google"),
                "gemini.google",
            ),
            (
                ("ai-platforms", "🧲 海外 AI", "DOMAIN-SUFFIX,x.ai"),
                "api.x.ai",
            ),
            (
                ("ai-platforms", "🧲 海外 AI", "DOMAIN-SUFFIX,openrouter.ai"),
                "openrouter.ai",
            ),
            (
                ("developer-platforms", "🧑‍💻 开发服务", "DOMAIN-SUFFIX,nodejs.org"),
                "nodejs.org",
            ),
            (
                ("developer-platforms", "🧑‍💻 开发服务", "DOMAIN-SUFFIX,nodejs.dev"),
                "nodejs.dev",
            ),
            (
                ("developer-platforms", "🧑‍💻 开发服务", "DOMAIN-SUFFIX,iojs.org"),
                "iojs.org",
            ),
            (
                ("developer-platforms", "🧑‍💻 开发服务", "DOMAIN-SUFFIX,npmjs.com"),
                "www.npmjs.com",
            ),
            (
                ("developer-platforms", "🧑‍💻 开发服务", "DOMAIN-SUFFIX,npmjs.org"),
                "registry.npmjs.org",
            ),
            (
                ("developer-platforms", "🧑‍💻 开发服务", "DOMAIN-SUFFIX,npm.im"),
                "npm.im",
            ),
            (
                ("nsfw", "🔞 NSFW", "DOMAIN-SUFFIX,e-hentai.org"),
                "e-hentai.org",
            ),
            (
                ("nsfw", "🔞 NSFW", "DOMAIN-SUFFIX,missav.ws"),
                "missav.ws",
            ),
            (
                ("nsfw", "🔞 NSFW", "DOMAIN-SUFFIX,missav.ai"),
                "missav.ai",
            ),
            (
                ("nsfw", "🔞 NSFW", "DOMAIN-SUFFIX,missav.live"),
                "missav.live",
            ),
            (
                ("nsfw", "🔞 NSFW", "DOMAIN-SUFFIX,hanime1.me"),
                "hanime1.me",
            ),
            (
                ("nsfw", "🔞 NSFW", "DOMAIN-SUFFIX,hanimeone.me"),
                "hanimeone.me",
            ),
            (
                ("nsfw", "🔞 NSFW", "DOMAIN-SUFFIX,hanime1.com"),
                "hanime1.com",
            ),
            (
                ("nsfw", "🔞 NSFW", "DOMAIN-SUFFIX,javchu.com"),
                "javchu.com",
            ),
            (
                ("nsfw", "🔞 NSFW", "DOMAIN-SUFFIX,av.jkforum.net"),
                "av.jkforum.net",
            ),
            (
                ("nsfw", "🔞 NSFW", "DOMAIN-SUFFIX,javdb.com"),
                "javdb.com",
            ),
            (
                ("us-media", "🎬 美国流媒体", "DOMAIN-SUFFIX,hulu.com"),
                "www.hulu.com",
            ),
            (
                ("us-media", "🎬 美国流媒体", "DOMAIN-SUFFIX,espn.com"),
                "www.espn.com",
            ),
            (
                (
                    "us-media",
                    "🎬 美国流媒体",
                    "DOMAIN-SUFFIX,espn.hb.omtrdc.net",
                ),
                "espn.hb.omtrdc.net",
            ),
            (
                (
                    "game-platform-late-recovery",
                    "🎮 游戏平台",
                    "DOMAIN-SUFFIX,geforce.co.uk",
                ),
                "www.geforce.co.uk",
            ),
            (
                (
                    "bilibili-hmt-late-recovery",
                    "🎬 B站港澳台",
                    "DOMAIN,0gr4uqmtt8y41hcjsgrzdrc31.ourdvsss.com",
                ),
                "0gr4uqmtt8y41hcjsgrzdrc31.ourdvsss.com",
            ),
            (
                (
                    "iqiyi-late-recovery",
                    "🎬 爱奇艺国际",
                    "DOMAIN-SUFFIX,71.am.com",
                ),
                "www.71.am.com",
            ),
            (
                (
                    "microsoft-late-recovery",
                    "DIRECT",
                    "DOMAIN-SUFFIX,21vbc.com",
                ),
                "www.21vbc.com",
            ),
            (
                (
                    "apple-late-recovery",
                    "DIRECT",
                    "DOMAIN-SUFFIX,100beatscheap.com",
                ),
                "www.100beatscheap.com",
            ),
            (
                (
                    "china-media-late-recovery",
                    "🌏 国内流媒体",
                    "DOMAIN-SUFFIX,cctvlib.cn",
                ),
                "www.cctvlib.cn",
            ),
            (
                (
                    "game-platform-late-recovery",
                    "🎮 游戏平台",
                    "DOMAIN-SUFFIX,roblox.com",
                ),
                "www.roblox.com",
            ),
            (
                (
                    "game-platform-late-recovery",
                    "🎮 游戏平台",
                    "DOMAIN-SUFFIX,rbxcdn.com",
                ),
                "static.rbxcdn.com",
            ),
            (("final", "🐟 漏网之鱼", "MATCH"), "roblox.evil.example"),
            (("final", "🐟 漏网之鱼", "MATCH"), "qiyi.evil.example"),
            (("final", "🐟 漏网之鱼", "MATCH"), "bilibili.evil.example"),
            (("final", "🐟 漏网之鱼", "MATCH"), "epicgames.evil.example"),
            (("final", "🐟 漏网之鱼", "MATCH"), "vikacg.com"),
            (("final", "🐟 漏网之鱼", "MATCH"), "example.invalid"),
        ]
        for expected, domain in cases:
            with self.subTest(domain=domain):
                self.assert_match(expected, domain=domain)

    def test_author_domain_is_the_first_rule(self) -> None:
        first_segment = self.sources.segments[0]
        self.assertEqual(
            (first_segment.slug, first_segment.target),
            ("author-domain", "🌏 国内网站"),
        )
        self.assertEqual(
            self.sources.rules["author-domain"],
            ("DOMAIN-SUFFIX,boxnook.cc", "DOMAIN-SUFFIX,zaunekko.com"),
        )
        for rule, domain in (
            ("DOMAIN-SUFFIX,boxnook.cc", "sub.boxnook.cc"),
            ("DOMAIN-SUFFIX,zaunekko.com", "zaunekko.com"),
        ):
            with self.subTest(domain=domain):
                self.assert_match(
                    ("author-domain", "🌏 国内网站", rule),
                    domain=domain,
                )

    def test_remote_streaming_is_direct_first(self) -> None:
        domain_cases = [
            ("DOMAIN-SUFFIX,tailscale.io", "control.tailscale.io"),
            ("DOMAIN-SUFFIX,ts.net", "host.example.ts.net"),
            ("DOMAIN,root-tok-01.zerotier.com", "root-tok-01.zerotier.com"),
            ("DOMAIN-SUFFIX,teamviewer.com", "router1.teamviewer.com"),
            ("DOMAIN-SUFFIX,todesk.com", "client.todesk.com"),
            ("DOMAIN-SUFFIX,oray.com", "sunlogin.oray.com"),
            ("DOMAIN-SUFFIX,raylink.live", "api.raylink.live"),
            ("DOMAIN-SUFFIX,shengwang.cn", "console.shengwang.cn"),
            ("DOMAIN-SUFFIX,agora.io", "edge.agora.io"),
            ("DOMAIN-SUFFIX,agoraio.cn", "edge.agoraio.cn"),
            ("DOMAIN-SUFFIX,sd-rtn.com", "edge.sd-rtn.com"),
            ("DOMAIN-SUFFIX,rtnsvc.com", "edge.rtnsvc.com"),
            ("DOMAIN-SUFFIX,rtesvc.com", "edge.rtesvc.com"),
            ("DOMAIN-SUFFIX,zego.im", "rtc-api.zego.im"),
            ("DOMAIN-SUFFIX,rongcloud.cn", "api.rongcloud.cn"),
            ("DOMAIN-SUFFIX,ronghub.com", "api.ronghub.com"),
            ("DOMAIN-SUFFIX,easemob.com", "api.easemob.com"),
        ]
        for rule, domain in domain_cases:
            with self.subTest(domain=domain):
                self.assert_match(
                    ("remote-streaming", "🖥️ 远程串流流量", rule),
                    domain=domain,
                )
        # Tailscale is split on purpose. The data plane is peer-to-peer UDP to a
        # peer address, so no domain rule reaches it and same-country peers stay
        # direct through the GEOIP tail. What the domains carry is the control
        # plane, the DERP relays and the admin console — and the console cannot
        # be reached from the mainland on a direct path, which is why the whole
        # tailscale.com surface sits under the developer policy while the
        # process rules keep the daemon itself direct wherever they apply.
        self.assert_match(
            ("remote-streaming-admin", "🖥️ 远程串流后台", "DOMAIN,login.tailscale.com"),
            domain="login.tailscale.com",
        )
        self.assert_match(
            ("remote-streaming", "🖥️ 远程串流流量", "DOMAIN-SUFFIX,tailscale.io"),
            domain="log.tailscale.io",
        )

        for process_name in [
            "tailscaled.exe",
            "tailscale.exe",
            "tailscaled",
            "IPNExtension",
            "zerotier-one_x64.exe",
            "zerotier-one_x86.exe",
            "zerotier-one_arm64.exe",
            "zerotier-one",
            "Moonlight.exe",
            "Moonlight",
            "sunshine.exe",
            "sunshine",
            "parsecd.exe",
            "parsecd",
            "rustdesk.exe",
            "rustdesk",
            "AnyDesk.exe",
            "AnyDesk",
            "TeamViewer.exe",
            "TeamViewer",
            "teamviewerd",
            "netbird.exe",
            "netbird",
            "remoting_host.exe",
            "remoting_me2me_host",
            "chrome-remote-desktop-host",
            "SteamLink.exe",
            "steamlink",
            "mstsc.exe",
        ]:
            with self.subTest(process_name=process_name):
                self.assert_match(
                    (
                        "remote-streaming",
                        "🖥️ 远程串流流量",
                        f"PROCESS-NAME,{process_name}",
                    ),
                    process_name=process_name,
                )

    def test_mainland_foundation_services_route_direct(self) -> None:
        direct_cases = {
            "www.geetest.com": "DOMAIN-SUFFIX,geetest.com",
            "www.yidun.com": "DOMAIN-SUFFIX,yidun.com",
            "www.jpush.cn": "DOMAIN-SUFFIX,jpush.cn",
            "docs.jiguang.cn": "DOMAIN-SUFFIX,jiguang.cn",
            "api.jiguang.com": "DOMAIN-SUFFIX,jiguang.com",
            "www.getui.com": "DOMAIN-SUFFIX,getui.com",
            "wshz.getui.net": "DOMAIN-SUFFIX,getui.net",
            "wshz.gepush.com": "DOMAIN-SUFFIX,gepush.com",
            "sdk.igexin.com": "DOMAIN-SUFFIX,igexin.com",
            "gitee.com": "DOMAIN-SUFFIX,gitee.com",
            "atomgit.com": "DOMAIN-SUFFIX,atomgit.com",
            "gitcode.com": "DOMAIN-SUFFIX,gitcode.com",
            "modelscope.cn": "DOMAIN-SUFFIX,modelscope.cn",
            "openxlab.org.cn": "DOMAIN-SUFFIX,openxlab.org.cn",
            "www.paddlepaddle.org.cn": "DOMAIN-SUFFIX,paddlepaddle.org.cn",
            "www.mindspore.cn": "DOMAIN-SUFFIX,mindspore.cn",
            "shimo.im": "DOMAIN-SUFFIX,shimo.im",
            "lanhuapp.com": "DOMAIN-SUFFIX,lanhuapp.com",
            "pixso.cn": "DOMAIN-SUFFIX,pixso.cn",
            "www.cfca.com.cn": "DOMAIN-SUFFIX,cfca.com.cn",
            "www.esign.cn": "DOMAIN-SUFFIX,esign.cn",
            "www.fadada.com": "DOMAIN-SUFFIX,fadada.com",
            "www.xuetangx.com": "DOMAIN-SUFFIX,xuetangx.com",
            "www.yuketang.cn": "DOMAIN-SUFFIX,yuketang.cn",
            "mooc.chaoxing.com": "DOMAIN-SUFFIX,chaoxing.com",
            "www.zhihuishu.com": "DOMAIN-SUFFIX,zhihuishu.com",
            "www.aqara.cn": "DOMAIN-SUFFIX,aqara.cn",
            "openapi.tuya.cn": "DOMAIN-SUFFIX,tuya.cn",
            "www.nio.cn": "DOMAIN-SUFFIX,nio.cn",
            "store.xiaopeng.com": "DOMAIN-SUFFIX,xiaopeng.com",
            "www.lixiang.com": "DOMAIN-SUFFIX,lixiang.com",
            "www.zeekr.com": "DOMAIN-SUFFIX,zeekr.com",
        }
        for domain, rule in direct_cases.items():
            with self.subTest(domain=domain):
                self.assert_match(
                    (mainland_slug(rule), "🌏 国内网站", rule),
                    domain=domain,
                )

        existing_cases = {
            "captcha.tencentcloudapi.com": (
                "china-cloud",
                "☁️ 国内云服务",
                "DOMAIN-SUFFIX,tencentcloudapi.com",
            ),
            "verify.cmpassport.com": (
                "china-web",
                "🌏 国内网站",
                "DOMAIN-SUFFIX,cmpassport.com",
            ),
            "api.netease.im": (
                "china-web",
                "🌏 国内网站",
                "DOMAIN-SUFFIX,netease.im",
            ),
        }
        for domain, expected in existing_cases.items():
            with self.subTest(domain=domain):
                self.assert_match(expected, domain=domain)

        for domain in [
            "api.tuya.com",
            "api.roborock.com",
            "api.ecovacs.com",
            "api.dreame.tech",
        ]:
            with self.subTest(domain=domain):
                self.assert_match(
                    ("final", "🐟 漏网之鱼", "MATCH"),
                    domain=domain,
                )

    def test_steam_and_mainland_consumer_routing_are_precise(self) -> None:
        steam_cases = {
            "gstore.val.manlaxy.com": "DOMAIN,gstore.val.manlaxy.com",
            "xz.sycontroller.com": "DOMAIN,xz.sycontroller.com",
            "dl.steam.clngaa.com": "DOMAIN,dl.steam.clngaa.com",
        }
        for domain, rule in steam_cases.items():
            with self.subTest(domain=domain):
                self.assert_match(
                    ("game-download", "🎮 游戏下载", rule),
                    domain=domain,
                )

        mainland_cases = {
            "www.ele.me": "DOMAIN-SUFFIX,ele.me",
            "api.eleme.cn": "DOMAIN-SUFFIX,eleme.cn",
            "fuss10.elemecdn.com": "DOMAIN-SUFFIX,elemecdn.com",
            "www.alibaba.cn": "DOMAIN-SUFFIX,alibaba.cn",
            "www.alibaba.com.cn": "DOMAIN-SUFFIX,alibaba.com.cn",
            "www.gov.cn": "DOMAIN-SUFFIX,gov.cn",
            "www.tsinghua.edu.cn": "DOMAIN-SUFFIX,edu.cn",
            "www.cas.ac.cn": "DOMAIN-SUFFIX,ac.cn",
            "www.mod.gov.cn": "DOMAIN-SUFFIX,gov.cn",
            "portal.mil.cn": "DOMAIN-SUFFIX,mil.cn",
        }
        for domain, rule in mainland_cases.items():
            with self.subTest(domain=domain):
                self.assert_match(
                    (mainland_slug(rule), "🌏 国内网站", rule),
                    domain=domain,
                )

        for domain in [
            "adashx.ut.ele.me",
            "h-adashx.ut.ele.me",
            "v6-adashx.ut.ele.me",
        ]:
            with self.subTest(domain=domain):
                self.assert_match(
                    (
                        "advertising-curated",
                        "🛑 广告拦截",
                        f"DOMAIN-SUFFIX,{domain}",
                    ),
                    domain=domain,
                )

        existing_mainland_cases = {
            "www.taobao.com": "DOMAIN-SUFFIX,taobao.com",
            "www.tmall.com": "DOMAIN-SUFFIX,tmall.com",
            "www.1688.com": "DOMAIN-SUFFIX,1688.com",
            "www.jd.com": "DOMAIN-SUFFIX,jd.com",
            "www.meituan.com": "DOMAIN-SUFFIX,meituan.com",
            "www.dianping.com": "DOMAIN-SUFFIX,dianping.com",
        }
        for domain, rule in existing_mainland_cases.items():
            with self.subTest(domain=domain):
                self.assert_match(
                    (mainland_slug(rule), "🌏 国内网站", rule),
                    domain=domain,
                )

        for domain in [
            "other.manlaxy.com",
            "other.sycontroller.com",
            "yif.gdtstream.com",
            "dl.steam.cygnaa.com",
            "www.tmall.hk",
            "www.jd.hk",
        ]:
            with self.subTest(domain=domain):
                self.assert_match(
                    ("final", "🐟 漏网之鱼", "MATCH"),
                    domain=domain,
                )

        self.assert_match(
            (
                "remote-streaming",
                "🖥️ 远程串流流量",
                "DOMAIN,root-mia-01.zerotier.com",
            ),
            domain="root-mia-01.zerotier.com",
        )
        self.assert_match(
            ("final", "🐟 漏网之鱼", "MATCH"),
            ip="103.195.103.66",
        )

        published_rules = {
            rule
            for entries in self.sources.rules.values()
            for rule in entries
        }
        for forbidden in [
            "DOMAIN-SUFFIX,manlaxy.com",
            "DOMAIN-SUFFIX,sycontroller.com",
            "DOMAIN,yif.gdtstream.com",
            "DOMAIN,dl.steam.cygnaa.com",
            "IP-CIDR,103.195.103.66/32,no-resolve",
            "IP-CIDR,103.195.103.0/24,no-resolve",
            "IP-CIDR,103.195.100.0/22,no-resolve",
        ]:
            with self.subTest(forbidden=forbidden):
                self.assertNotIn(forbidden, published_rules)

    def test_mainland_ai_video_and_third_party_playback_route_direct(self) -> None:
        ai_video_cases = {
            "seko.sensetime.com": "DOMAIN-SUFFIX,sensetime.com",
            "p1-kling.klingai.com": "DOMAIN-SUFFIX,klingai.com",
            "v1-kling.kechuangai.com": "DOMAIN-SUFFIX,kechuangai.com",
            "api.vidu.cn": "DOMAIN-SUFFIX,vidu.cn",
            "platform.vidu.com": "DOMAIN-SUFFIX,vidu.com",
            "www.hailuoai.com": "DOMAIN-SUFFIX,hailuoai.com",
            "www.liblib.art": "DOMAIN-SUFFIX,liblib.art",
            "liblibai-web-static.liblib.cloud": "DOMAIN-SUFFIX,liblib.cloud",
            "www.liblib.tv": "DOMAIN-SUFFIX,liblib.tv",
            "www.runninghub.cn": "DOMAIN-SUFFIX,runninghub.cn",
            "rh-images.xiaoyaoyou.com": "DOMAIN,rh-images.xiaoyaoyou.com",
            "api.tusiart.cn": "DOMAIN-SUFFIX,tusiart.cn",
            "assets.tusiassets.com": "DOMAIN-SUFFIX,tusiassets.com",
            "www.moki.cn": "DOMAIN-SUFFIX,moki.cn",
            "doc.chanjing.cc": "DOMAIN-SUFFIX,chanjing.cc",
            "studio.wujieai.com": "DOMAIN-SUFFIX,wujieai.com",
            "cdn.wujiebantu.com": "DOMAIN-SUFFIX,wujiebantu.com",
            "dev.shanjian.tv": "DOMAIN-SUFFIX,shanjian.tv",
            "www.shanjian-china.com": "DOMAIN-SUFFIX,shanjian-china.com",
            "duix.guiji.ai": "DOMAIN-SUFFIX,guiji.ai",
            "www.guiji.cn": "DOMAIN-SUFFIX,guiji.cn",
            "aic.oceanengine.com": "DOMAIN-SUFFIX,oceanengine.com",
        }
        for domain, rule in ai_video_cases.items():
            with self.subTest(domain=domain):
                self.assert_match(
                    (mainland_slug(rule), "🌏 国内网站", rule),
                    domain=domain,
                )

        existing_jimeng_cases = {
            "www.jimeng.com": "DOMAIN-SUFFIX,jimeng.com",
            "jimeng.jianying.com": "DOMAIN-SUFFIX,jianying.com",
            "zenvideo.qq.com": "DOMAIN-SUFFIX,qq.com",
            "aigc.baidu.com": "DOMAIN-SUFFIX,baidu.com",
            "www.whee.com": "DOMAIN-SUFFIX,whee.com",
        }
        for domain, rule in existing_jimeng_cases.items():
            with self.subTest(domain=domain):
                self.assert_match(
                    (mainland_slug(rule), "🌏 国内网站", rule),
                    domain=domain,
                )

        playback_cases = {
            "cj.lziapi.com": "DOMAIN-SUFFIX,lziapi.com",
            "v.lzcdn31.com": "DOMAIN-SUFFIX,lzcdn31.com",
            "v.cdnlz22.com": "DOMAIN-SUFFIX,cdnlz22.com",
            "cj.ffzyapi.com": "DOMAIN-SUFFIX,ffzyapi.com",
            "vip.ffzy-play8.com": "DOMAIN-SUFFIX,ffzy-play8.com",
            "vip.ffzy-play9.com": "DOMAIN-SUFFIX,ffzy-play9.com",
            "bfzyapi.com": "DOMAIN-SUFFIX,bfzyapi.com",
            "v.fengbao11.com": "DOMAIN-SUFFIX,fengbao11.com",
            "suoniapi.com": "DOMAIN-SUFFIX,suoniapi.com",
            "v14.rstu6.com": "DOMAIN-SUFFIX,rstu6.com",
            "v9.ppqrrs.com": "DOMAIN-SUFFIX,ppqrrs.com",
            "api.apibdzy.com": "DOMAIN-SUFFIX,apibdzy.com",
            "vod6.bdzybf11.com": "DOMAIN-SUFFIX,bdzybf11.com",
            "api.wujinapi.com": "DOMAIN-SUFFIX,wujinapi.com",
            "www.hongniuzy2.com": "DOMAIN-SUFFIX,hongniuzy2.com",
            "api.zuidazy.me": "DOMAIN-SUFFIX,zuidazy.me",
            "vip.ffzy-play3.com": "DOMAIN-SUFFIX,ffzy-play3.com",
            "api.kczyapi.com": "DOMAIN-SUFFIX,kczyapi.com",
            "vod2.kczybf.com": "DOMAIN,vod2.kczybf.com",
            "api.sdzyapi.com": "DOMAIN-SUFFIX,sdzyapi.com",
            "v8.qqqrst.com": "DOMAIN-SUFFIX,qqqrst.com",
            "m3u8.apiyhzy.com": "DOMAIN-SUFFIX,apiyhzy.com",
            "vod12.wgslsw.com": "DOMAIN-SUFFIX,wgslsw.com",
            "www.huyaapi.com": "DOMAIN-SUFFIX,huyaapi.com",
            "1080p.huyall.com": "DOMAIN-SUFFIX,huyall.com",
            "p2100.net": "DOMAIN-SUFFIX,p2100.net",
            "v14.yuglf.com": "DOMAIN-SUFFIX,yuglf.com",
            "caiji.moduapi.cc": "DOMAIN-SUFFIX,moduapi.cc",
            "play.modujx17.com": "DOMAIN-SUFFIX,modujx17.com",
            "api.xinlangapi.com": "DOMAIN-SUFFIX,xinlangapi.com",
            "api.hhzyapi.com": "DOMAIN-SUFFIX,hhzyapi.com",
            "play.hhuus.com": "DOMAIN,play.hhuus.com",
            "api.subocaiji.com": "DOMAIN-SUFFIX,subocaiji.com",
            "play.xluuss.com": "DOMAIN,play.xluuss.com",
            "hn.bfvvs.com": "DOMAIN,hn.bfvvs.com",
            "hnzy.bfvvs.com": "DOMAIN,hnzy.bfvvs.com",
            "v7.zuidazym3u8.com": "DOMAIN-SUFFIX,zuidazym3u8.com",
            "ikunzyapi.com": "DOMAIN-SUFFIX,ikunzyapi.com",
            "video.bfikuncdn.com": "DOMAIN-SUFFIX,bfikuncdn.com",
            "video.ikzybf.com": "DOMAIN-SUFFIX,ikzybf.com",
            "www.imgikzy.com": "DOMAIN-SUFFIX,imgikzy.com",
            "v3.sxzyhuij.com": "DOMAIN-SUFFIX,sxzyhuij.com",
            "v8.suonizy-youku.com": "DOMAIN-SUFFIX,suonizy-youku.com",
            "img.snzypic.com": "DOMAIN-SUFFIX,snzypic.com",
        }
        for domain, rule in playback_cases.items():
            with self.subTest(domain=domain):
                self.assert_match(
                    ("china-media", "🌏 国内流媒体", rule),
                    domain=domain,
                )

        current_m3u8_suffixes = [
            "cdnlz22.com",
            "lfthirtytwo.com",
            "lz15uu.com",
            "lzcdn27.com",
            "lzcdn28.com",
            "lzcdn31.com",
            "lzcdn33v1.com",
            "ffzy-online1.com",
            "ffzy-online3.com",
            "ffzy-online5.com",
            "ffzy-online6.com",
            "ffzy-play5.com",
            "ffzy-play3.com",
            "ffzy-play8.com",
            "ffzy-play9.com",
            "ffzy-play10.com",
            "ffzy-plays.com",
            "feifei-play.com",
            "feifei-kan.com",
            "ffzy-bofang.com",
            "ddbbffcdn.com",
            "rrcdnbf5.com",
            "rrcdnbf6.com",
            "bvvvvvvv7f.com",
            "bvvvvvvvvv1f.com",
            "bfllvip.com",
            "baofeng9.com",
            "baofeng11.com",
            "fengbao8.com",
            "fengbao10.com",
            "fengbao11.com",
            "rstu6.com",
            "ppqrrs.com",
            "bdzybf11.com",
            "bdzybf22.com",
            "qqqrst.com",
            "wgslsw.com",
            "huyall.com",
            "yuglf.com",
            "modujx10.com",
            "modujx11.com",
            "modujx12.com",
            "modujx13.com",
            "modujx14.com",
            "modujx15.com",
            "modujx16.com",
            "modujx17.com",
            "zuidazym3u8.com",
            "bfikuncdn.com",
            "ikzybf.com",
        ]
        for suffix in current_m3u8_suffixes:
            with self.subTest(m3u8_suffix=suffix):
                self.assert_match(
                    (
                        "china-media",
                        "🌏 国内流媒体",
                        f"DOMAIN-SUFFIX,{suffix}",
                    ),
                    domain=f"video.{suffix}",
                )

        current_direct_mp4_suffixes = [
            "lzdow1314.top",
            "dowlz2.com",
            "dowlz5.com",
            "dowlz6.com",
            "dowlz10.com",
            "dowlz11.com",
            "dowlz12.com",
            "dowlz17.com",
            "dowlz18.com",
            "dowlz19.com",
            "lz8xiazai.com",
            "lzidw2025.com",
            "lzdown26.com",
            "lzdown27.com",
            "lzdown28.com",
            "lzdown29.com",
            "lzcdn33v1.com",
        ]
        for suffix in current_direct_mp4_suffixes:
            with self.subTest(direct_mp4_suffix=suffix):
                self.assert_match(
                    (
                        "china-media",
                        "🌏 国内流媒体",
                        f"DOMAIN-SUFFIX,{suffix}",
                    ),
                    domain=f"download.{suffix}",
                )

        for shared_rule in [
            "DOMAIN-SUFFIX,kwai.com",
            "DOMAIN-SUFFIX,sanity.io",
            "DOMAIN-SUFFIX,doubanio.com",
            "DOMAIN-SUFFIX,geocities.jp",
            "DOMAIN-SUFFIX,vibex.cn",
            "DOMAIN-SUFFIX,tensorartassets.com",
            "DOMAIN-SUFFIX,xiaoyaoyou.com",
        ]:
            with self.subTest(shared_rule=shared_rule):
                self.assertNotIn(shared_rule, self.sources.rules["china-web"])
                self.assertNotIn(shared_rule, self.sources.rules["china-media"])

    def test_domestic_and_overseas_cloud_routing_is_region_aware(self) -> None:
        domestic_cases = {
            "console.aliyun.com": "DOMAIN-SUFFIX,aliyun.com",
            "bucket.oss-cn-hangzhou.aliyuncs.com": "DOMAIN-SUFFIX,aliyuncs.com",
            "console.cloud.tencent.com": "DOMAIN-SUFFIX,cloud.tencent.com",
            "bucket.cos.ap-beijing.myqcloud.com": "DOMAIN-SUFFIX,myqcloud.com",
            "console.huaweicloud.com": "DOMAIN-SUFFIX,huaweicloud.com",
            "obs.cn-north-4.myhuaweicloud.com": "DOMAIN-SUFFIX,myhuaweicloud.com",
            "console.volcengine.com": "DOMAIN-SUFFIX,volcengine.com",
            "api.ucloud.cn": "DOMAIN-SUFFIX,ucloud.cn",
            "bucket.cn-bj.ufileos.com": "DOMAIN-SUFFIX,ufileos.com",
            "internal-cn-sh2-01.ufileos.com": "DOMAIN-SUFFIX,ufileos.com",
            "console.qingcloud.com": "DOMAIN-SUFFIX,qingcloud.com",
            "bucket.bcebos.com": "DOMAIN-SUFFIX,bcebos.com",
            "cloud.baidu.com": "DOMAIN,cloud.baidu.com",
            "console.bce.baidu.com": "DOMAIN,console.bce.baidu.com",
            "console.jdcloud.com": "DOMAIN-SUFFIX,jdcloud.com",
            "dns.jdclouddns.com": "DOMAIN-SUFFIX,jdclouddns.com",
            "edge.jdcloudedge.com": "DOMAIN-SUFFIX,jdcloudedge.com",
            "lb.jdcloudlb.com": "DOMAIN-SUFFIX,jdcloudlb.com",
            "waf.jdcloudwaf.com": "DOMAIN-SUFFIX,jdcloudwaf.com",
            "console.ksyun.com": "DOMAIN-SUFFIX,ksyun.com",
            "bucket.ks3-cn-beijing.ksyuncs.com": "DOMAIN-SUFFIX,ksyuncs.com",
            "test.clouddn.com": "DOMAIN-SUFFIX,clouddn.com",
            "bucket.s3-cn-east-1.qiniucs.com": "DOMAIN-SUFFIX,qiniucs.com",
            "bucket.s3.cn-east-1.qiniucs.com": "DOMAIN-SUFFIX,qiniucs.com",
            "bucket.oos-cn.ctyunapi.cn": "DOMAIN-SUFFIX,ctyunapi.cn",
            "console.amazonaws.cn": "DOMAIN-SUFFIX,amazonaws.cn",
            "s3.cn-north-1.amazonaws.com.cn": "DOMAIN-SUFFIX,amazonaws.com.cn",
            "portal.azure.cn": "DOMAIN-SUFFIX,azure.cn",
            "edge.cloudflarechina.cn": "DOMAIN-SUFFIX,cloudflarechina.cn",
            "www.example.cn.cdn.cloudflareanycast.net": "DOMAIN-SUFFIX,cloudflareanycast.net",
            "beacon.cloudflareinsights-cn.com": "DOMAIN-SUFFIX,cloudflareinsights-cn.com",
            "gateway.cloudflarestoragegw.com": "DOMAIN-SUFFIX,cloudflarestoragegw.com",
        }
        for domain, rule in domestic_cases.items():
            with self.subTest(domain=domain):
                self.assert_match(
                    ("china-cloud", "☁️ 国内云服务", rule),
                    domain=domain,
                )

        overseas_cases = {
            "www.alibabacloud.com": "DOMAIN-SUFFIX,alibabacloud.com",
            "bucket.oss-ap-southeast-1.aliyuncs.com": "DOMAIN-SUFFIX,oss-ap-southeast-1.aliyuncs.com",
            "bucket.oss-me-central-1.aliyuncs.com": "DOMAIN-SUFFIX,oss-me-central-1.aliyuncs.com",
            "ecs.ap-southeast-1.aliyuncs.com": "DOMAIN-SUFFIX,ap-southeast-1.aliyuncs.com",
            "ecs-vpc.ap-southeast-1.aliyuncs.com": "DOMAIN-SUFFIX,ap-southeast-1.aliyuncs.com",
            "vpc.eu-central-1.aliyuncs.com": "DOMAIN-SUFFIX,eu-central-1.aliyuncs.com",
            "ecs.us-southeast-1.aliyuncs.com": "DOMAIN-SUFFIX,us-southeast-1.aliyuncs.com",
            "ecs.ap-southeast-8.aliyuncs.com": "DOMAIN-SUFFIX,ap-southeast-8.aliyuncs.com",
            "ecs.cn-hongkong.aliyuncs.com": "DOMAIN-SUFFIX,cn-hongkong.aliyuncs.com",
            "bucket.oss-accelerate-overseas.aliyuncs.com": "DOMAIN-SUFFIX,oss-accelerate-overseas.aliyuncs.com",
            "intl.cloud.tencent.com": "DOMAIN,intl.cloud.tencent.com",
            "www.tencentcloud.com": "DOMAIN-SUFFIX,tencentcloud.com",
            "console.tencentcloud.com": "DOMAIN-SUFFIX,tencentcloud.com",
            "bucket.cos.ap-singapore.myqcloud.com": "DOMAIN-SUFFIX,cos.ap-singapore.myqcloud.com",
            "obs.ap-southeast-3.myhuaweicloud.com": "DOMAIN-SUFFIX,ap-southeast-3.myhuaweicloud.com",
            "console-intl.huaweicloud.com": "DOMAIN,console-intl.huaweicloud.com",
            "bucket.us-ca.ufileos.com": "DOMAIN-SUFFIX,us-ca.ufileos.com",
            "bucket.s3-us-ca.ufileos.com": "DOMAIN-SUFFIX,s3-us-ca.ufileos.com",
            "bucket.internal-sg-01.ufileos.com": "DOMAIN-SUFFIX,internal-sg-01.ufileos.com",
            "bucket.ks3-sgp.ksyuncs.com": "DOMAIN-SUFFIX,ks3-sgp.ksyuncs.com",
            "bucket.oos-cnhk-hqnet.ctyunapi.cn": "DOMAIN-SUFFIX,oos-cnhk-hqnet.ctyunapi.cn",
            "bucket.s3-us-north-1.qiniucs.com": "DOMAIN-SUFFIX,s3-us-north-1.qiniucs.com",
            "bucket.s3.us-north-1.qiniucs.com": "DOMAIN-SUFFIX,s3.us-north-1.qiniucs.com",
            "bucket.s3-ap-southeast-1.qiniucs.com": "DOMAIN-SUFFIX,s3-ap-southeast-1.qiniucs.com",
            "bucket.s3.ap-southeast-1.qiniucs.com": "DOMAIN-SUFFIX,s3.ap-southeast-1.qiniucs.com",
            "console.byteplus.com": "DOMAIN,console.byteplus.com",
            "open.ap-southeast-1.byteplusapi.com": "DOMAIN-SUFFIX,byteplusapi.com",
            "console.aws.amazon.com": "DOMAIN-SUFFIX,console.aws.amazon.com",
            "us-east-1.console.aws.amazon.com": "DOMAIN-SUFFIX,console.aws.amazon.com",
            "eu-west-1.console.aws.amazon.com": "DOMAIN-SUFFIX,console.aws.amazon.com",
            "signin.aws.amazon.com": "DOMAIN-SUFFIX,signin.aws.amazon.com",
            "us-east-1.signin.aws.amazon.com": "DOMAIN-SUFFIX,signin.aws.amazon.com",
            "us-east-1.sso.signin.aws": "DOMAIN-SUFFIX,signin.aws",
            "ec2.us-east-1.api.aws": "DOMAIN-SUFFIX,api.aws",
            "abcdefg.lambda-url.us-east-1.on.aws": "DOMAIN-SUFFIX,on.aws",
            "s3.us-east-1.amazonaws.com": "DOMAIN-SUFFIX,amazonaws.com",
            "aws.amazon.com": "DOMAIN-SUFFIX,aws.amazon.com",
            "docs.aws.amazon.com": "DOMAIN-SUFFIX,aws.amazon.com",
            "portal.azure.com": "DOMAIN-SUFFIX,azure.com",
            "service.azure-api.net": "DOMAIN-SUFFIX,azure-api.net",
            "registry.azurecr.io": "DOMAIN-SUFFIX,azurecr.io",
            "hub.azure-devices.net": "DOMAIN-SUFFIX,azure-devices.net",
            "container.westeurope.azurecontainer.io": "DOMAIN-SUFFIX,azurecontainer.io",
            "app.azurecontainerapps.io": "DOMAIN-SUFFIX,azurecontainerapps.io",
            "adb-123.1.azuredatabricks.net": "DOMAIN-SUFFIX,azuredatabricks.net",
            "workspace.azuresynapse.net": "DOMAIN-SUFFIX,azuresynapse.net",
            "cluster.azmk8s.io": "DOMAIN-SUFFIX,azmk8s.io",
            "service.search.windows.net": "DOMAIN-SUFFIX,search.windows.net",
            "app.azurestaticapps.net": "DOMAIN-SUFFIX,azurestaticapps.net",
            "cache.redis.cache.windows.net": "DOMAIN-SUFFIX,redis.cache.windows.net",
            "storage.file.core.windows.net": "DOMAIN-SUFFIX,core.windows.net",
            "server.database.windows.net": "DOMAIN-SUFFIX,database.windows.net",
            "namespace.servicebus.windows.net": "DOMAIN-SUFFIX,servicebus.windows.net",
            "console.cloud.google.com": "DOMAIN-SUFFIX,cloud.google.com",
            "cloudresourcemanager.googleapis.com": "DOMAIN,cloudresourcemanager.googleapis.com",
            "compute.googleapis.com": "DOMAIN,compute.googleapis.com",
            "bigquery.googleapis.com": "DOMAIN,bigquery.googleapis.com",
            "container.googleapis.com": "DOMAIN,container.googleapis.com",
            "sqladmin.googleapis.com": "DOMAIN,sqladmin.googleapis.com",
            "iam.googleapis.com": "DOMAIN,iam.googleapis.com",
            "pubsub.googleapis.com": "DOMAIN,pubsub.googleapis.com",
            "secretmanager.googleapis.com": "DOMAIN,secretmanager.googleapis.com",
            "artifactregistry.googleapis.com": "DOMAIN,artifactregistry.googleapis.com",
            "project.firebaseio.com": "DOMAIN-SUFFIX,firebaseio.com",
            "project.europe-west1.firebasedatabase.app": "DOMAIN-SUFFIX,firebasedatabase.app",
            "firebasedatabase.googleapis.com": "DOMAIN,firebasedatabase.googleapis.com",
            "firebasestorage.googleapis.com": "DOMAIN,firebasestorage.googleapis.com",
            "storage.googleapis.com": "DOMAIN-SUFFIX,storage.googleapis.com",
            "example-bucket.storage.googleapis.com": "DOMAIN-SUFFIX,storage.googleapis.com",
            "compute.europe-west1.rep.googleapis.com": "DOMAIN-SUFFIX,rep.googleapis.com",
            "example.workers.dev": "DOMAIN-SUFFIX,workers.dev",
            "www.digitalocean.com": "DOMAIN-SUFFIX,digitalocean.com",
            "www.vultr.com": "DOMAIN-SUFFIX,vultr.com",
            "bucket.ewr1.vultrobjects.com": "DOMAIN-SUFFIX,vultrobjects.com",
            "api.linode.com": "DOMAIN-SUFFIX,linode.com",
            "cloud.oracle.com": "DOMAIN,cloud.oracle.com",
            "objectstorage.us-ashburn-1.oraclecloud.com": "DOMAIN-SUFFIX,oraclecloud.com",
        }
        for domain, rule in overseas_cases.items():
            with self.subTest(domain=domain):
                self.assert_match(
                    ("overseas-cloud", "☁️ 海外云服务", rule),
                    domain=domain,
                )

        self.assert_match(
            ("china-cloud", "☁️ 国内云服务", "DOMAIN-SUFFIX,aliyuncs.com"),
            domain="ecs.cn-hangzhou.aliyuncs.com",
        )

        shared_google_api_cases = {
            "fonts.googleapis.com": "DOMAIN-SUFFIX,googleapis.com",
            "people.googleapis.com": "DOMAIN-SUFFIX,googleapis.com",
            "www.recaptcha.net": "DOMAIN-SUFFIX,recaptcha.net",
        }
        for domain, rule in shared_google_api_cases.items():
            with self.subTest(domain=domain):
                self.assert_match(
                    ("google", "🔎 Google", rule),
                    domain=domain,
                )

        priority_cases = {
            "gmeconf.qcloud.com": (
                "china-web",
                "🌏 国内网站",
                "DOMAIN,gmeconf.qcloud.com",
            ),
            "epicgames-download1-1251447533.file.myqcloud.com": (
                "game-download",
                "🎮 游戏下载",
                "DOMAIN,epicgames-download1-1251447533.file.myqcloud.com",
            ),
            "github-cloud.s3.amazonaws.com": (
                "developer-platforms",
                "🧑‍💻 开发服务",
                "DOMAIN,github-cloud.s3.amazonaws.com",
            ),
            "113-219-145-1.ksyungslb.com": (
                "bilibili-hmt-late-recovery",
                "🎬 B站港澳台",
                "DOMAIN,113-219-145-1.ksyungslb.com",
            ),
            "aiplatform.googleapis.com": (
                "google-ai",
                "🧲 海外 AI",
                "DOMAIN,aiplatform.googleapis.com",
            ),
            "youtubei.googleapis.com": (
                "youtube",
                "🎬 YouTube",
                "DOMAIN-SUFFIX,youtubei.googleapis.com",
            ),
            "openaiapi-site.azureedge.net": (
                "openai",
                "🧲 OpenAI",
                "DOMAIN-SUFFIX,openaiapi-site.azureedge.net",
            ),
        }
        for domain, expected in priority_cases.items():
            with self.subTest(domain=domain):
                self.assert_match(expected, domain=domain)

        advertising_cases = {
            "acjs.aliyun.com": "DOMAIN-SUFFIX,acjs.aliyun.com",
            "adash.man.aliyuncs.com": "DOMAIN-SUFFIX,adash.man.aliyuncs.com",
            "mobads-pre-config.cdn.bcebos.com": "DOMAIN-SUFFIX,mobads-pre-config.cdn.bcebos.com",
        }
        for domain, rule in advertising_cases.items():
            with self.subTest(domain=domain):
                self.assert_match(
                    ("advertising-curated", "🛑 广告拦截", rule),
                    domain=domain,
                )

        published_cloud_rules = {
            rule
            for slug in ("china-cloud", "overseas-cloud")
            for rule in self.sources.rules[slug]
        }
        self.assertTrue(
            all(
                parse_rule(rule, context="cloud routing test")[0]
                in {"DOMAIN", "DOMAIN-SUFFIX"}
                for rule in published_cloud_rules
            )
        )
        self.assertNotIn("DOMAIN-SUFFIX,googleapis.com", published_cloud_rules)
        self.assertIn("DOMAIN-SUFFIX,googleapis.com", self.sources.rules["google"])
        self.assertNotIn("DOMAIN-SUFFIX,recaptcha.net", self.sources.rules["china-web"])
        self.assertIn("DOMAIN-SUFFIX,recaptcha.net", self.sources.rules["google"])
        self.assertNotIn("DOMAIN-SUFFIX,firebase.io", published_cloud_rules)
        for forbidden in [
            "DOMAIN-SUFFIX,alibaba.com",
            "DOMAIN-SUFFIX,tencent.com",
            "DOMAIN-SUFFIX,huawei.com",
            "DOMAIN-SUFFIX,baidu.com",
            "DOMAIN-SUFFIX,jd.com",
            "DOMAIN-SUFFIX,kingsoft.com",
            "DOMAIN-SUFFIX,google.com",
            "DOMAIN-SUFFIX,oracle.com",
            "DOMAIN-SUFFIX,akamaihd.net",
            "DOMAIN-SUFFIX,akamaized.net",
        ]:
            with self.subTest(forbidden=forbidden):
                self.assertNotIn(forbidden, published_cloud_rules)

    def test_mainland_apps_use_existing_direct_first_groups(self) -> None:
        game_cases = {
            "api.xiaoheihe.cn": "DOMAIN-SUFFIX,xiaoheihe.cn",
            "camp.5eplaycdn.com": "DOMAIN-SUFFIX,5eplaycdn.com",
            "app.pwesports.cn": "DOMAIN-SUFFIX,pwesports.cn",
            "pvp.wanmei.com": "DOMAIN-SUFFIX,wanmei.com",
            "www.taptap.cn": "DOMAIN-SUFFIX,taptap.cn",
            "www.miyoushe.com": "DOMAIN-SUFFIX,miyoushe.com",
            "bbs.nga.cn": "DOMAIN-SUFFIX,nga.cn",
            "www.4399.com": "DOMAIN-SUFFIX,4399.com",
            "www.gamersky.com": "DOMAIN-SUFFIX,gamersky.com",
            "www.hupu.com": "DOMAIN-SUFFIX,hupu.com",
            "www.wegame.com.cn": "DOMAIN-SUFFIX,wegame.com.cn",
            "lol.qq.com": "DOMAIN-SUFFIX,lol.qq.com",
            "cn.voice.gcloudcs.com": "DOMAIN-SUFFIX,gcloudcs.com",
            "gmeconf.qcloud.com": "DOMAIN,gmeconf.qcloud.com",
            "qcloud.rtc.qq.com": "DOMAIN,qcloud.rtc.qq.com",
            "tqos.anticheatexpert.com": "DOMAIN,tqos.anticheatexpert.com",
        }
        for domain, rule in game_cases.items():
            with self.subTest(domain=domain):
                self.assert_match(
                    (mainland_slug(rule), "🌏 国内网站", rule),
                    domain=domain,
                )

        download_cases = {
            "down.anticheatexpert.com": "DOMAIN,down.anticheatexpert.com",
            "down.val.qq.com": "DOMAIN,down.val.qq.com",
            "download.wegame.qq.com": "DOMAIN,download.wegame.qq.com",
            "patch.tapapks.com": "DOMAIN-SUFFIX,tapapks.com",
            "client.wmupd.com": "DOMAIN-SUFFIX,wmupd.com",
            # The apex does not resolve; the hosts that carry game content do.
            # psnobj/psn-rsc under the same parent serve web images and belong
            # with the platform instead, which ER-057 separates.
            "gs2-sec.ww.prod.dl.playstation.net": (
                "DOMAIN-SUFFIX,ww.prod.dl.playstation.net"
            ),
            "zeus.dl.playstation.net": "DOMAIN,zeus.dl.playstation.net",
            "blzdist-wow.necdn.leihuo.netease.com": (
                "DOMAIN,blzdist-wow.necdn.leihuo.netease.com"
            ),
        }
        for domain, rule in download_cases.items():
            with self.subTest(domain=domain):
                self.assert_match(
                    ("game-download", "🎮 游戏下载", rule),
                    domain=domain,
                )

        overseas_game_cases = {
            "store.steampowered.com": "DOMAIN-SUFFIX,steampowered.com",
            "www.epicgames.com": "DOMAIN-SUFFIX,epicgames.com",
            "www.riotgames.com": "DOMAIN-SUFFIX,riotgames.com",
        }
        for domain, rule in overseas_game_cases.items():
            with self.subTest(domain=domain):
                self.assert_match(
                    ("game-platform", "🎮 游戏平台", rule),
                    domain=domain,
                )

        media_cases = {
            "2903b6af430652442ea0043b94efcead.v.smtcdns.com": (
                "DOMAIN,2903b6af430652442ea0043b94efcead.v.smtcdns.com"
            ),
            "www.douyin.com": "DOMAIN-SUFFIX,douyin.com",
            "api.amemv.com": "DOMAIN-SUFFIX,amemv.com",
            "aweme.snssdk.com": "DOMAIN,aweme.snssdk.com",
            "www.huya.com": "DOMAIN-SUFFIX,huya.com",
            "www.yy.com": "DOMAIN-SUFFIX,yy.com",
        }
        for domain, rule in media_cases.items():
            with self.subTest(domain=domain):
                self.assert_match(
                    ("china-media", "🌏 国内流媒体", rule),
                    domain=domain,
                )

        web_cases = {
            "fp-it.fengkongcloud.com": "DOMAIN,fp-it.fengkongcloud.com",
            "fp-it-acc.fengkongcloud.com": "DOMAIN,fp-it-acc.fengkongcloud.com",
            "cap.dingxiang-inc.com": "DOMAIN-SUFFIX,dingxiang-inc.com",
            "tenant-api.dingxiang-inc.com": "DOMAIN-SUFFIX,dingxiang-inc.com",
            "id6.me": "DOMAIN,id6.me",
            "hs.wosms.cn": "DOMAIN,hs.wosms.cn",
            "restapi.amap.com": "DOMAIN-SUFFIX,amap.com",
            "kyfw.12306.cn": "DOMAIN-SUFFIX,12306.cn",
            "www.dingtalk.com": "DOMAIN-SUFFIX,dingtalk.com",
            "www.feishu.cn": "DOMAIN-SUFFIX,feishu.cn",
            "www.wps.cn": "DOMAIN-SUFFIX,wps.cn",
            "www.aliyundrive.com": "DOMAIN-SUFFIX,aliyundrive.com",
            "www.sf-express.com": "DOMAIN-SUFFIX,sf-express.com",
            "www.zhipin.com": "DOMAIN-SUFFIX,zhipin.com",
            "www.unionpay.com": "DOMAIN-SUFFIX,unionpay.com",
            "www.icbc.com.cn": "DOMAIN-SUFFIX,icbc.com.cn",
            "www.abchina.com": "DOMAIN-SUFFIX,abchina.com",
            "www.bankcomm.com": "DOMAIN-SUFFIX,bankcomm.com",
            "www.psbc.com": "DOMAIN-SUFFIX,psbc.com",
            "www.zuoyebang.com": "DOMAIN-SUFFIX,zuoyebang.com",
            "www.dongchedi.com": "DOMAIN-SUFFIX,dongchedi.com",
        }
        for domain, rule in web_cases.items():
            with self.subTest(domain=domain):
                self.assert_match(
                    (mainland_slug(rule), "🌏 国内网站", rule),
                    domain=domain,
                )

        advertising_cases = {
            "adashx.ut.amap.com": "DOMAIN-SUFFIX,adashx.ut.amap.com",
            "log-upload.mihoyo.com": "DOMAIN-SUFFIX,log-upload.mihoyo.com",
            "syh.zybang.com": "DOMAIN-SUFFIX,syh.zybang.com",
        }
        for domain, rule in advertising_cases.items():
            with self.subTest(domain=domain):
                self.assert_match(
                    ("advertising-curated", "🛑 广告拦截", rule),
                    domain=domain,
                )

        international_cases = {
            "api.snssdk.com": "DOMAIN-SUFFIX,snssdk.com",
            "www.tiktok.com": "DOMAIN-SUFFIX,tiktok.com",
            "api.tiktokv.com": "DOMAIN-SUFFIX,tiktokv.com",
        }
        for domain, rule in international_cases.items():
            with self.subTest(domain=domain):
                self.assert_match(
                    ("tiktok", "🎶 TikTok", rule),
                    domain=domain,
                )

        for domain in [
            "www.taptap.io",
            "another-tenant.v.smtcdns.com",
            "tqos-yun.anticheatexpert.com",
            "riot-mtp.anticheatexpert.com",
            "fp-na-it.fengkongcloud.com",
            "api-device-eur.fengkongcloud.com",
        ]:
            with self.subTest(domain=domain):
                self.assert_match(
                    ("final", "🐟 漏网之鱼", "MATCH"),
                    domain=domain,
                )

        tiktok_rules = self.sources.rules["tiktok"]
        self.assertIn("DOMAIN-SUFFIX,snssdk.com", tiktok_rules)
        segments = [segment.slug for segment in self.sources.segments]
        self.assertLess(segments.index("china-media"), segments.index("tiktok"))
        self.assertNotIn(
            "DOMAIN-SUFFIX,smtcdns.com", self.sources.rules["china-media"]
        )
        self.assertNotIn(
            "DOMAIN-SUFFIX,anticheatexpert.com", self.sources.rules["china-web"]
        )
        self.assertNotIn(
            "DOMAIN-SUFFIX,fengkongcloud.com", self.sources.rules["china-web"]
        )
        published_rules = {
            rule
            for entries in self.sources.rules.values()
            for rule in entries
        }
        for forbidden in [
            "PROCESS-NAME,WeGame.exe",
        ]:
            with self.subTest(forbidden=forbidden):
                self.assertNotIn(forbidden, published_rules)

    def test_mainland_and_global_ai_sites_are_separated(self) -> None:
        mainland_cases = {
            "deepseek.com": "deepseek.com",
            "moonshot.cn": "moonshot.cn",
            "bigmodel.cn": "bigmodel.cn",
            "doubao.com": "doubao.com",
            "qianwen.com": "qianwen.com",
            "minimaxi.com": "minimaxi.com",
        }
        for domain, suffix in mainland_cases.items():
            with self.subTest(domain=domain):
                self.assert_match(
                    (
                        "china-web",
                        "🌏 国内网站",
                        f"DOMAIN-SUFFIX,{suffix}",
                    ),
                    domain=domain,
                )
        global_cases = {
            "kimi.com": "kimi.com",
            "z.ai": "z.ai",
            "qwen.ai": "qwen.ai",
            "minimax.io": "minimax.io",
            "dola.com": "dola.com",
            "figma.com": "figma.com",
            "figma.site": "figma.site",
        }
        for domain, suffix in global_cases.items():
            with self.subTest(domain=domain):
                self.assert_match(
                    (
                        "ai-platforms",
                        "🧲 海外 AI",
                        f"DOMAIN-SUFFIX,{suffix}",
                    ),
                    domain=domain,
                )
        existing_mainland_cases = {
            "yiyan.baidu.com": "DOMAIN-SUFFIX,baidu.com",
            "yuanbao.tencent.com": "DOMAIN-SUFFIX,tencent.com",
            "xinghuo.xfyun.cn": "DOMAIN-SUFFIX,xfyun.cn",
            "www.taobao.com": "DOMAIN-SUFFIX,taobao.com",
        }
        for domain, rule in existing_mainland_cases.items():
            with self.subTest(domain=domain):
                self.assert_match(
                    (mainland_slug(rule), "🌏 国内网站", rule),
                    domain=domain,
                )

    def test_developer_ecosystem_routes_to_manual_selector(self) -> None:
        cases = {
            "registry-1.docker.io": "DOMAIN-SUFFIX,docker.io",
            "ghcr.io": "DOMAIN-SUFFIX,ghcr.io",
            "services.gradle.org": "DOMAIN-SUFFIX,gradle.org",
            "registry.npmjs.org": "DOMAIN-SUFFIX,npmjs.org",
            "pypi.org": "DOMAIN-SUFFIX,pypi.org",
            "files.pythonhosted.org": "DOMAIN-SUFFIX,pythonhosted.org",
            "static.crates.io": "DOMAIN-SUFFIX,crates.io",
            "api.nuget.org": "DOMAIN-SUFFIX,nuget.org",
            "formulae.brew.sh": "DOMAIN-SUFFIX,brew.sh",
            "linear.app": "DOMAIN-SUFFIX,linear.app",
            "www.notion.so": "DOMAIN-SUFFIX,notion.so",
            "api.notion.com": "DOMAIN-SUFFIX,notion.com",
            "secure.notion-static.com": "DOMAIN-SUFFIX,notion-static.com",
            "img.notionusercontent.com": "DOMAIN-SUFFIX,notionusercontent.com",
            "notion.new": "DOMAIN,notion.new",
            "wss-primary.slack.com": "DOMAIN-SUFFIX,slack.com",
            "workspace.atlassian.net": "DOMAIN-SUFFIX,atlassian.net",
            "api.postman.com": "DOMAIN-SUFFIX,postman.com",
            "api.sentry.io": "DOMAIN,api.sentry.io",
            "api.vercel.com": "DOMAIN-SUFFIX,vercel.com",
            "project.supabase.co": "DOMAIN-SUFFIX,supabase.co",
            "app.netlify.com": "DOMAIN-SUFFIX,netlify.com",
            "backboard.railway.app": "DOMAIN,backboard.railway.app",
            "dashboard.render.com": "DOMAIN-SUFFIX,render.com",
            "api.fly.io": "DOMAIN-SUFFIX,fly.io",
            "dashboard.heroku.com": "DOMAIN-SUFFIX,heroku.com",
            "app.circleci.com": "DOMAIN-SUFFIX,circleci.com",
            "app.datadoghq.com": "DOMAIN-SUFFIX,datadoghq.com",
            "grafana.com": "DOMAIN-SUFFIX,grafana.com",
            "one.newrelic.com": "DOMAIN,one.newrelic.com",
            "www.jetbrains.com": "DOMAIN-SUFFIX,jetbrains.com",
            "deno.land": "DOMAIN-SUFFIX,deno.land",
            "registry.terraform.io": "DOMAIN-SUFFIX,terraform.io",
            "api.pulumi.com": "DOMAIN-SUFFIX,pulumi.com",
            "app.prisma.io": "DOMAIN-SUFFIX,prisma.io",
            "cloud.mongodb.com": "DOMAIN-SUFFIX,mongodb.com",
            "console.neon.tech": "DOMAIN-SUFFIX,neon.tech",
            "app.planetscale.com": "DOMAIN-SUFFIX,planetscale.com",
            "replit.com": "DOMAIN-SUFFIX,replit.com",
            "stackblitz.com": "DOMAIN-SUFFIX,stackblitz.com",
            "pub.dev": "DOMAIN-SUFFIX,pub.dev",
        }
        for domain, rule in cases.items():
            with self.subTest(domain=domain):
                self.assert_match(
                    ("developer-platforms", "🧑‍💻 开发服务", rule),
                    domain=domain,
                )
        self.assert_match(
            (
                "china-web",
                "🌏 国内网站",
                "DOMAIN-SUFFIX,npmmirror.com",
            ),
            domain="registry.npmmirror.com",
        )


class GenerationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.sources = load_profile_sources(SOURCES)

    def test_two_clean_renders_are_byte_identical(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            parent = Path(temporary)
            first = parent / "first"
            second = parent / "second"
            render_profile(self.sources, first)
            render_profile(self.sources, second)
            self.assertTrue(compare_trees(first, second).clean)

    def test_retired_ruleset_urls_are_generated_only_aliases(self) -> None:
        self.assertEqual(
            GENERATED_RULESET_ALIASES,
            {
                "kakao-talk": (
                    "line",
                    36,
                    51,
                    "4d7a40149baa508048e0258477af4df12e84a2c5a03de92602c744026da79244",
                    "a585752df3b3752c55a28cdff6e8724152f821f893390870ea9aa87f96f3745d",
                ),
                "xai": (
                    "ai-platforms",
                    22,
                    25,
                    "82b8ec35bac749f1cdf2b449645ba4eff36fe5c7a878c5e3986168ab2d504781",
                    "c528ddafca25108e32bca53a4de650b0ba9a96b20667ab02fc5b95a774cf3eb6",
                ),
                "onedrive": (
                    "cloud-storage",
                    0,
                    23,
                    "70b2124935f9ed33e71bd6b2f6ee8ebb255fc0c31e1c9daea67312f42ed2e551",
                    "402e08c9c0bf57fa829a3ab35f90997e02d33a640b5bc53e4c26507766f0cd31",
                ),
                "icloud": (
                    "cloud-storage",
                    23,
                    81,
                    "a18ea06b044741747d770012fed661d9226f1bc87613b101a9d34ca28795bc84",
                    "b3cf1286b7fbd0becc1dbf8ef7dbc1384d3264077d49c53455b1e339557fb328",
                ),
                "hbo-max": (
                    "hbo-go",
                    26,
                    42,
                    "76a309cf767328e4b45f4e7f92a0974a3203e450e36ac24d54b40038f1e94464",
                    "80b025db9fd58216c1becee57c65c3f8facf3352f15993ed1be522cf12f5efee",
                ),
                "spotify-2": (
                    "spotify",
                    7,
                    21,
                    "1197e4bd8607004d93075d893352879fd9e45d252278b5c695dfca4115a28e81",
                    "06da8a204ae8ebd52082fd18c3766ee9929873b9e5b28484077cb5c662a7700d",
                ),
            },
        )
        self.assertTrue(GENERATED_RULESET_ALIASES.keys().isdisjoint(self.sources.rules))
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "generated"
            render_profile(self.sources, output)
            generated_manifest = json.loads(
                (output / "manifest.json").read_text(encoding="utf-8")
            )["files"]
            active_text = "\n".join(
                (output / relative).read_text(encoding="utf-8")
                for relative in (
                    "config/ekko-rules.ini",
                    "Mihomo/reversed-template.yaml",
                )
            )
            for alias_slug, alias in GENERATED_RULESET_ALIASES.items():
                with self.subTest(alias=alias_slug):
                    list_path = output / "Ruleset" / f"{alias_slug}.list"
                    provider_path = (
                        output / "Providers" / "Ruleset" / f"{alias_slug}.yaml"
                    )
                    expected_entries = self.sources.rules[alias.canonical][
                        alias.start : alias.end
                    ]
                    self.assertEqual(
                        list_path.read_text(encoding="utf-8").splitlines(),
                        list(expected_entries),
                    )
                    self.assertEqual(
                        hashlib.sha256(list_path.read_bytes()).hexdigest(),
                        alias.list_sha256,
                    )
                    self.assertEqual(
                        yaml.safe_load(provider_path.read_text(encoding="utf-8")),
                        {"payload": list(expected_entries)},
                    )
                    self.assertEqual(
                        hashlib.sha256(provider_path.read_bytes()).hexdigest(),
                        alias.provider_sha256,
                    )
                    self.assertIn(f"Ruleset/{alias_slug}.list", generated_manifest)
                    self.assertIn(
                        f"Providers/Ruleset/{alias_slug}.yaml", generated_manifest
                    )
                    self.assertNotIn(f"/{alias_slug}.list", active_text)
                    self.assertNotIn(f"/{alias_slug}.yaml", active_text)
                    self.assertNotIn(f"RULE-SET,{alias_slug},", active_text)
        self.assertEqual(len(self.sources.rule_segments), 63)
        self.assertEqual(len(self.sources.segments), 64)

    def test_stale_file_is_detected_by_check_mode(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "generated"
            shutil.copytree(GENERATED, output)
            (output / "stale.list").write_text("DOMAIN,stale.example\n", encoding="utf-8")
            completed = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPTS / "generate_profile.py"),
                    "--output",
                    str(output),
                    "--check",
                ],
                capture_output=True,
                text=True,
                encoding="utf-8",
            )
            self.assertEqual(completed.returncode, 1)
            result = json.loads(completed.stdout)
            self.assertEqual(result["status"], "out-of-date")
            self.assertEqual(result["extra"], ["stale.list"])

    def test_failed_render_does_not_modify_existing_output(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            parent = Path(temporary)
            source_copy = parent / "sources"
            output = parent / "generated"
            shutil.copytree(SOURCES, source_copy)
            shutil.copytree(GENERATED, output)
            before = {path.relative_to(output): path.read_bytes() for path in output.rglob("*") if path.is_file()}
            manifest_path = source_copy / "manifest.yaml"
            manifest_path.write_text(
                manifest_path.read_text(encoding="utf-8").replace(
                    "source: rules/openai.list", "source: ../outside.list", 1
                ),
                encoding="utf-8",
            )
            completed = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPTS / "generate_profile.py"),
                    "--sources",
                    str(source_copy),
                    "--output",
                    str(output),
                ],
                capture_output=True,
                text=True,
                encoding="utf-8",
            )
            self.assertEqual(completed.returncode, 2)
            after = {path.relative_to(output): path.read_bytes() for path in output.rglob("*") if path.is_file()}
            self.assertEqual(before, after)

    def test_render_destination_must_be_new(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            destination = Path(temporary) / "existing"
            destination.mkdir()
            with self.assertRaises(ProfileError):
                render_profile(self.sources, destination)

    def test_existing_unowned_output_is_not_overwritten(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "important"
            output.mkdir()
            marker = output / "keep.txt"
            marker.write_text("keep\n", encoding="utf-8")
            completed = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPTS / "generate_profile.py"),
                    "--output",
                    str(output),
                ],
                capture_output=True,
                text=True,
                encoding="utf-8",
            )
            self.assertEqual(completed.returncode, 2)
            self.assertEqual(marker.read_text(encoding="utf-8"), "keep\n")

    def test_stale_empty_directory_is_detected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "generated"
            shutil.copytree(GENERATED, output)
            (output / "Ruleset" / "orphan-empty").mkdir()
            completed = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPTS / "generate_profile.py"),
                    "--output",
                    str(output),
                    "--check",
                ],
                capture_output=True,
                text=True,
                encoding="utf-8",
            )
            self.assertEqual(completed.returncode, 1)
            result = json.loads(completed.stdout)
            self.assertEqual(result["extra_directories"], ["Ruleset/orphan-empty"])
            validation = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPTS / "validate_generated.py"),
                    "--generated",
                    str(output),
                    "--skip-generation-check",
                ],
                capture_output=True,
                text=True,
                encoding="utf-8",
            )
            self.assertEqual(validation.returncode, 1)

    def test_forged_analysis_is_rejected_without_generation_check(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "generated"
            shutil.copytree(GENERATED, output)
            analysis_path = output / "analysis.json"
            analysis = parse_json_document(
                analysis_path.read_text(encoding="utf-8"), context=str(analysis_path)
            )
            analysis["products"]["core"]["summary"][
                "destination_ip_rule_count"
            ] = 1
            analysis_path.write_text(
                json.dumps(analysis, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
                newline="\n",
            )
            self.update_manifest_hash(output, "analysis.json")
            completed = self.run_validator_without_generation_check(output)
            self.assertEqual(completed.returncode, 1)
            self.assertIn("analysis.json differs", completed.stderr)

    def test_duplicate_json_key_is_rejected_without_generation_check(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "generated"
            shutil.copytree(GENERATED, output)
            analysis_path = output / "analysis.json"
            text = analysis_path.read_text(encoding="utf-8")
            analysis_path.write_text(
                text.replace(
                    '  "products": {',
                    '  "products": {},\n  "products": {',
                    1,
                ),
                encoding="utf-8",
                newline="\n",
            )
            self.update_manifest_hash(output, "analysis.json")
            completed = self.run_validator_without_generation_check(output)
            self.assertEqual(completed.returncode, 1)
            self.assertIn("Duplicate JSON key", completed.stderr)

    def test_duplicate_yaml_key_is_rejected_without_generation_check(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "generated"
            shutil.copytree(GENERATED, output)
            provider = output / "Providers" / "Ruleset" / "openai.yaml"
            provider.write_text(
                "payload:\n- password: phase2-secret\n"
                + provider.read_text(encoding="utf-8"),
                encoding="utf-8",
                newline="\n",
            )
            self.update_manifest_hash(output, "Providers/Ruleset/openai.yaml")
            completed = self.run_validator_without_generation_check(output)
            self.assertEqual(completed.returncode, 1)
            self.assertIn("Duplicate YAML key", completed.stderr)

    def test_disabled_rule_generator_is_rejected_without_generation_check(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "generated"
            shutil.copytree(GENERATED, output)
            preset = output / "config" / "ekko-rules.ini"
            preset.write_text(
                preset.read_text(encoding="utf-8").replace(
                    "enable_rule_generator=true",
                    "enable_rule_generator=false",
                    1,
                ),
                encoding="utf-8",
                newline="\n",
            )
            self.update_manifest_hash(output, "config/ekko-rules.ini")
            completed = self.run_validator_without_generation_check(output)
            self.assertEqual(completed.returncode, 1)
            self.assertIn("Rule-generator controls differ", completed.stderr)

    def test_absolute_posix_path_in_product_is_rejected_independently(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "generated"
            shutil.copytree(GENERATED, output)
            readme = output / "README.md"
            readme.write_text(
                readme.read_text(encoding="utf-8") + "\n/mnt/alice/private.sock\n",
                encoding="utf-8",
                newline="\n",
            )
            self.update_manifest_hash(output, "README.md")
            completed = self.run_validator_without_generation_check(output)
            self.assertEqual(completed.returncode, 1)
            self.assertIn("absolute POSIX path", completed.stderr)

    def test_short_github_pat_in_product_is_rejected_independently(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "generated"
            shutil.copytree(GENERATED, output)
            readme = output / "README.md"
            readme.write_text(
                readme.read_text(encoding="utf-8")
                + "\n" + "ghp_" + "a" * 36 + "\n",
                encoding="utf-8",
                newline="\n",
            )
            self.update_manifest_hash(output, "README.md")
            completed = self.run_validator_without_generation_check(output)
            self.assertEqual(completed.returncode, 1)
            self.assertIn("Credential-shaped token", completed.stderr)

    @unittest.skipIf(sys.platform == "win32", "Creating symlinks may require Windows developer mode")
    def test_external_symbolic_link_is_rejected_independently(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            output = root / "generated"
            shutil.copytree(GENERATED, output)
            external = root / "external-readme.md"
            external.write_bytes((output / "README.md").read_bytes())
            (output / "README.md").unlink()
            (output / "README.md").symlink_to(external)
            completed = self.run_validator_without_generation_check(output)
            self.assertEqual(completed.returncode, 1)
            self.assertIn("symbolic links", completed.stderr)

    def update_manifest_hash(self, output: Path, relative: str) -> None:
        manifest_path = output / "manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["files"][relative] = hashlib.sha256(
            (output / relative).read_bytes()
        ).hexdigest()
        manifest_path.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
            newline="\n",
        )

    def run_validator_without_generation_check(
        self, output: Path
    ) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [
                sys.executable,
                str(SCRIPTS / "validate_generated.py"),
                "--generated",
                str(output),
                "--skip-generation-check",
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
        )


class RuleEvidenceTests(unittest.TestCase):
    def test_registrable_root_handles_multi_label_suffixes(self) -> None:
        cases = {
            "sax.sina.com.cn": "sina.com.cn",
            "i0.sinaimg.cn": "sinaimg.cn",
            "securepubads.g.doubleclick.net": "doubleclick.net",
            "assets.guim.co.uk": "guim.co.uk",
            "example.com": "example.com",
            "cn": "cn",
        }
        for host, expected in cases.items():
            with self.subTest(host=host):
                self.assertEqual(rule_evidence.registrable_root(host), expected)

    def test_capture_becomes_reviewable_evidence_without_upstream_input(self) -> None:
        capture = {
            "https://a.example": ["a.example", "tracker.vendor.example"],
            "https://b.example": ["b.example", "tracker.vendor.example"],
        }
        with mock.patch.object(
            rule_evidence, "resolve", return_value={"status": 0, "resolves": True, "chain": []}
        ):
            records = rule_evidence.build_evidence(capture)
        summary = rule_evidence.summarise(records)
        self.assertEqual(summary["hosts"], 3)
        self.assertEqual(summary["third_party_hosts"], 1)
        reach = {row["root"]: row["site_count"] for row in summary["roots_by_reach"]}
        self.assertEqual(reach, {"vendor.example": 2})

    def test_committed_observation_capture_is_well_formed(self) -> None:
        for path in sorted((ROOT / "docs" / "evidence").glob("observation-*.json")):
            with self.subTest(capture=path.name):
                capture = rule_evidence.load_capture(path)
                self.assertTrue(capture)
                for origin, hosts in capture.items():
                    self.assertTrue(origin.startswith("https://"))
                    self.assertTrue(hosts)


if __name__ == "__main__":
    unittest.main()


class AdvertisingAdmissionContractTests(unittest.TestCase):
    """The committed reviews and the shipped corpus must agree, in both directions.

    A review that records a verdict the product does not honour is worse than no
    review: it reads as evidence while describing something that was never
    published. Both defects this guards against were real - the curated set was
    built additively while an import still covered part of it, and a later
    evidence file was generated from a hand-kept list rather than from the rules.
    """

    @classmethod
    def setUpClass(cls) -> None:
        cls.sources = load_profile_sources(SOURCES)

    def lands_in_advertising(self, host: str) -> bool:
        return (
            first_match(self.sources, domain=host)["slug"] == "advertising-curated"
        )

    def test_every_admitted_host_reaches_the_advertising_policy(self) -> None:
        review = json.loads(ADMISSION_REVIEW.read_text(encoding="utf-8"))
        missed = [
            record["host"]
            for record in review["records"]
            if record["verdict"] == "admit" and not self.lands_in_advertising(record["host"])
        ]
        self.assertEqual(missed, [], "hosts reviewed as admit that the product does not block")

    def test_no_held_or_rejected_host_reaches_the_advertising_policy(self) -> None:
        review = json.loads(ADMISSION_REVIEW.read_text(encoding="utf-8"))
        blocked = [
            record["host"]
            for record in review["records"]
            if record["verdict"] != "admit" and self.lands_in_advertising(record["host"])
        ]
        self.assertEqual(blocked, [], "hosts reviewed as hold or reject that the product blocks")

    def test_mainland_review_verdicts_match_the_shipped_corpus(self) -> None:
        review = json.loads(MAINLAND_AD_REVIEW.read_text(encoding="utf-8"))
        disagreements = []
        for key in ("delivery_records", "tracking_records"):
            for record in review[key]:
                shipped = self.lands_in_advertising(record["host"])
                if (record["verdict"] == "admit") != shipped:
                    disagreements.append((record["host"], record["verdict"], shipped))
        self.assertEqual(disagreements, [], "review verdicts that disagree with the rules")

    def test_admitted_hosts_record_a_route_that_matches_their_evidence(self) -> None:
        """An admission route has to agree with the record it sits on.

        Carrying a stale rationale forward is how a record ends up saying a
        criterion is not met while the verdict says it is.
        """
        review = json.loads(MAINLAND_AD_REVIEW.read_text(encoding="utf-8"))
        wrong = []
        for key in ("delivery_records", "tracking_records"):
            for record in review[key]:
                if record["verdict"] != "admit":
                    continue
                expected = (
                    "third-party"
                    if record["third_party_count"]
                    else "operator's own dedicated endpoint"
                )
                if record.get("admission_route") != expected:
                    wrong.append((record["host"], record.get("admission_route")))
                if not record.get("first_party_safety"):
                    wrong.append((record["host"], "no criterion 4 rationale"))
                rejecty = (
                    "not advertising",
                    "criterion",
                    "coincidence",
                    "not delivery",
                    "reviewed, not",
                    "does not resolve",
                )
                if any(phrase in record["reason"].lower() for phrase in rejecty):
                    wrong.append((record["host"], "reason contradicts the verdict"))
        self.assertEqual(wrong, [], "admitted records whose route or rationale does not match")

    def evidenced_hosts(self) -> tuple[set[str], set[str]]:
        """Return the hosts a committed review admits, and the declared ad systems."""
        reviewed: set[str] = set()
        admission = json.loads(ADMISSION_REVIEW.read_text(encoding="utf-8"))
        reviewed |= {
            record["host"].lower()
            for record in admission["records"]
            if record["verdict"] == "admit"
        }
        mainland = json.loads(MAINLAND_AD_REVIEW.read_text(encoding="utf-8"))
        for key in ("delivery_records", "tracking_records"):
            reviewed |= {
                record["host"].lower()
                for record in mainland[key]
                if record["verdict"] == "admit"
            }
        # The grandfathered set is closed: these rules predate the rebuild and
        # their criterion 1 and 2 evidence was never committed, so they count as
        # evidence only for the exact hosts enumerated, and the set may not grow.
        legacy = json.loads(LEGACY_AD_REVIEW.read_text(encoding="utf-8"))
        reviewed |= {record["host"].lower() for record in legacy["records"]}

        # Only verdicts count. ad-vendors-2026-09-19.txt and
        # adstxt-candidates-2026-09-19.txt are query seeds and candidate lists -
        # the vendor file names bytedance.com, whose general API infrastructure is
        # not advertising - so neither is evidence that a domain serves ads.
        declared = {
            record["system"].lower()
            for record in json.loads(ADS_TXT_EVIDENCE.read_text(encoding="utf-8"))["records"]
            if len(record.get("declared_by", [])) >= 2
        }
        declared |= {
            record["root"].lower()
            for record in json.loads(AD_SERVING_PROBE.read_text(encoding="utf-8"))["records"]
            if record["serves_advertising"]
        }
        return reviewed, declared

    GRANDFATHERED_LIMIT = 28

    def test_the_grandfathered_set_is_closed(self) -> None:
        """A rule may leave the grandfathered set; none may join it.

        These records satisfy criteria 3 and 4 only — the observation that would
        satisfy criteria 1 and 2 predates the rebuild and was never committed.
        That is acceptable for rules already shipping and reviewed; it is not a
        route for admitting new ones.
        """
        legacy = json.loads(LEGACY_AD_REVIEW.read_text(encoding="utf-8"))
        self.assertEqual(legacy["status"], "grandfathered")
        self.assertLessEqual(
            len(legacy["records"]),
            self.GRANDFATHERED_LIMIT,
            "the grandfathered set may shrink, never grow",
        )
        claiming = [
            record["host"]
            for record in legacy["records"]
            if record.get("admission_route") or record.get("criteria_satisfied") != [3, 4]
        ]
        self.assertEqual(claiming, [], "grandfathered records claiming evidence they do not have")

    def test_every_published_advertising_rule_maps_to_committed_evidence(self) -> None:
        """The direction that catches a deleted record.

        Walking the review files and checking the product only proves the
        records that still exist are honoured. Walking the published rules is
        what proves no rule ships without a committed reason for it.
        """
        reviewed, declared = self.evidenced_hosts()
        roots = {
            record["root"].lower()
            for record in json.loads(AD_ROOT_REVIEW.read_text(encoding="utf-8"))["records"]
        }

        def evidenced(value: str) -> bool:
            # The rule's own value has to be evidenced. A reviewed host beneath a
            # root does not justify blocking the root: mi.gdt.qq.com is reviewed
            # and does not make DOMAIN-SUFFIX,qq.com admissible. Blocking a whole
            # root needs its own record saying no other service lives under it.
            return value in reviewed or value in declared or value in roots

        unmapped = [
            entry
            for entry in self.sources.rules["advertising-curated"]
            if not evidenced(parse_rule(entry, context="evidence mapping")[1].lower())
        ]
        self.assertEqual(unmapped, [], "published advertising rules with no committed evidence")


class MainlandEvidenceContractTests(unittest.TestCase):
    """The mainland segments carry 4,224 rules and must be auditable too.

    Advertising got this contract first because a wrong rule there blocks
    something. A wrong rule here sends traffic direct that should be proxied,
    which is the same class of defect with a quieter failure.
    """

    CN_GRANDFATHERED_LIMIT = 269

    @classmethod
    def setUpClass(cls) -> None:
        cls.sources = load_profile_sources(SOURCES)

    def test_every_mainland_rule_maps_to_committed_evidence(self) -> None:
        apnic = {
            record["root"].lower()
            for record in json.loads(CN_APNIC_VERDICTS.read_text(encoding="utf-8"))["records"]
            if record["mainland_hosted"]
        }
        observed = {
            record["root"].lower()
            for record in json.loads(CN_OBSERVATION.read_text(encoding="utf-8"))["records"]
        }
        legacy = {
            value.lower()
            for value in json.loads(CN_LEGACY_DIRECT.read_text(encoding="utf-8"))["values"]
        }
        evidenced = apnic | observed | legacy
        unmapped = [
            entry
            for slug in ("china-web", "china-direct-curated")
            for entry in self.sources.rules[slug]
            if parse_rule(entry, context="mainland evidence")[1].lower() not in evidenced
        ]
        self.assertEqual(unmapped, [], "mainland rules with no committed evidence")

    def test_the_mainland_grandfathered_set_is_closed(self) -> None:
        legacy = json.loads(CN_LEGACY_DIRECT.read_text(encoding="utf-8"))
        self.assertEqual(legacy["status"], "grandfathered")
        self.assertLessEqual(
            len(legacy["values"]),
            self.CN_GRANDFATHERED_LIMIT,
            "the mainland grandfathered set may shrink, never grow",
        )


class LiteProductTests(unittest.TestCase):
    """The lite product is the same corpus behind fewer switches.

    It exists so someone who does not want to think about forty-two policies
    can still get the routing. What it may not do is change where traffic
    goes: folding a group is a decision about how many knobs the user sees,
    never about whether a rule ends up direct, proxied or rejected.
    """

    @classmethod
    def setUpClass(cls) -> None:
        cls.sources = load_profile_sources(SOURCES)
        document = cls.sources.proxy_groups_document
        cls.first_member = {
            group["name"]: group["members"][0] for group in document["groups"]
        }

    def effective_action(self, target: str) -> str:
        """DIRECT, REJECT, or PROXY — what the traffic actually does."""
        if target in ("DIRECT", "REJECT"):
            return target
        leading = self.first_member[target]
        return leading if leading in ("DIRECT", "REJECT") else "PROXY"

    def test_both_products_carry_the_same_rules(self) -> None:
        core = {
            segment.slug: self.sources.rules[segment.slug]
            for segment in self.sources.rule_segments_for("core")
        }
        lite = {
            segment.slug: self.sources.rules[segment.slug]
            for segment in self.sources.rule_segments_for("lite")
        }
        self.assertEqual(core, lite, "the lite product must not change a single rule")

    def test_folding_a_group_never_changes_what_traffic_does(self) -> None:
        changed = [
            (
                segment.slug,
                segment.target_for("core"),
                segment.target_for("lite"),
            )
            for segment in self.sources.rule_segments_for("core")
            if self.effective_action(segment.target_for("core"))
            != self.effective_action(segment.target_for("lite"))
        ]
        self.assertEqual(changed, [], "lite redirects that change direct/proxy/reject")

    def test_lite_publishes_fewer_groups_and_every_target_exists(self) -> None:
        core_groups = self.sources.proxy_groups_for("core")
        lite_groups = self.sources.proxy_groups_for("lite")
        self.assertLess(len(lite_groups), len(core_groups))
        published = {group.name for group in lite_groups}
        missing = [
            segment.target_for("lite")
            for segment in self.sources.rule_segments_for("lite")
            if segment.target_for("lite") not in published
            and segment.target_for("lite") != "DIRECT"
        ]
        self.assertEqual(missing, [], "lite segments pointing at groups lite does not publish")

    def test_a_product_is_only_ever_described_by_its_own_policies(self) -> None:
        """Published descriptions must not name groups the product lacks.

        Both products come from the same segments, so anything reading
        `segment.target` instead of `segment.target_for(product)` keeps the
        full build's answer while claiming to describe the lite one. That
        shipped: every one of the 47 retargeted segments appeared in the lite
        analysis pointing at a group the lite configuration does not define,
        and the target-derived quality metrics were the full build's.
        """
        analysis = build_analysis(self.sources)
        for product in PRODUCTS:
            available = {
                group.name for group in self.sources.proxy_groups_for(product)
            } | {"DIRECT", "REJECT"}
            for record in analysis["products"][product]["segments"]:
                self.assertIn(
                    record["target"],
                    available,
                    f"{product} analysis names {record['target']}, which that "
                    f"product does not define ({record['slug']})",
                )

    def test_asking_where_traffic_goes_answers_for_the_product_asked(self) -> None:
        """`first_match` carried the same defect, unreported."""
        for product in PRODUCTS:
            available = {
                group.name for group in self.sources.proxy_groups_for(product)
            } | {"DIRECT", "REJECT"}
            for domain in ("chat.openai.com", "www.netflix.com", "www.baidu.com"):
                verdict = first_match(self.sources, product=product, domain=domain)
                self.assertIn(
                    verdict["target"],
                    available,
                    f"{product} routes {domain} to {verdict['target']}, which "
                    f"that product does not define",
                )

class ProvenanceAccountingTests(unittest.TestCase):
    """The provenance table has to add up to the product it describes.

    It drifted twice without anyone noticing: once when rules moved into the
    mainland curation without the split being updated, leaving the mainland and
    remainder categories 369 rules apart from the sources, and again when a
    round of additions left the headline and the table partitioning a corpus
    smaller than the one being published. Both times the document still read as
    an audit.

    Checking only the grand total does not prevent that. Two categories wrong by
    the same amount in opposite directions sum correctly, which is exactly the
    shape the 369-rule drift had, so every row is checked against the segments
    it claims to describe and the categories are checked to partition the
    corpus: every rule segment in exactly one, none left over.
    """

    # Each row of the table, in order, and the segments it accounts for. The
    # remainder is whatever the named boundaries do not claim, which is what
    # makes a rule moving between boundaries fail here rather than cancel out.
    NAMED_BOUNDARIES = (
        ("Current late recovery", lambda slug: slug.endswith("late-recovery")),
        (
            "Observation-derived mainland direct curation",
            lambda slug: slug in {"china-web", "china-direct-curated"},
        ),
        (
            "Observation-derived advertising curation",
            lambda slug: slug == "advertising-curated",
        ),
        ("Overseas shopping curation", lambda slug: slug == "overseas-shopping"),
        (
            "Finance and account registration curation",
            lambda slug: slug == "finance",
        ),
    )
    REMAINDER_LABEL = "Specialized, private/local, and service corpus"

    @classmethod
    def setUpClass(cls) -> None:
        cls.sources = load_profile_sources(SOURCES)
        cls.text = (ROOT / "docs" / "PROVENANCE.md").read_text(encoding="utf-8")

    def accounting_section(self) -> str:
        start = self.text.index("## Current rule accounting")
        end = self.text.index("## Direct canonical inputs")
        return self.text[start:end]

    def published_rows(self) -> "list[tuple[str, int]]":
        rows = []
        for line in self.accounting_section().splitlines():
            match = re.match(r"\|\s*([^|]+?)\s*\|\s*([\d,]+)\s*\|", line)
            if match:
                rows.append((match.group(1), int(match.group(2).replace(",", ""))))
        return rows

    def counted_boundaries(self) -> "dict[str, int]":
        slugs = [segment.slug for segment in self.sources.rule_segments_for("core")]
        counted = {}
        claimed = set()
        for label, belongs in self.NAMED_BOUNDARIES:
            owned = [slug for slug in slugs if belongs(slug)]
            overlap = claimed.intersection(owned)
            self.assertEqual(
                overlap, set(), f"{label} claims segments another boundary already has"
            )
            claimed.update(owned)
            counted[label] = sum(len(self.sources.rules[slug]) for slug in owned)
        remainder = [slug for slug in slugs if slug not in claimed]
        counted[self.REMAINDER_LABEL] = sum(
            len(self.sources.rules[slug]) for slug in remainder
        )
        return counted

    def test_every_row_matches_the_segments_it_claims(self) -> None:
        counted = self.counted_boundaries()
        published = dict(self.published_rows())
        self.assertEqual(
            set(published),
            set(counted),
            "the table's categories and the checked boundaries must be the same set",
        )
        for label, expected in counted.items():
            self.assertEqual(
                published[label],
                expected,
                f"{label} is published as {published[label]} but its segments hold {expected}",
            )

    def test_the_boundaries_partition_the_published_corpus(self) -> None:
        counted = self.counted_boundaries()
        self.assertEqual(
            sum(counted.values()),
            scope_metrics(self.sources, product="core")["rules_in_files"],
            "the boundaries must account for every published rule exactly once",
        )

    def test_the_headline_and_the_remainder_quote_the_same_corpus(self) -> None:
        section = self.accounting_section()
        published = scope_metrics(self.sources, product="core")["rules_in_files"]
        headline = re.search(r"The ([\d,]+) file rules are partitioned", section)
        self.assertIsNotNone(headline, "the accounting headline is missing")
        self.assertEqual(int(headline.group(1).replace(",", "")), published)

        # The prose names the last category again; it said 2,794 while the table
        # said 2,818, so the two disagreed with each other as well as with the
        # sources.
        remainder = re.search(r"The final ([\d,]+)-rule category", section)
        self.assertIsNotNone(remainder, "the remainder sentence is missing")
        self.assertEqual(
            int(remainder.group(1).replace(",", "")),
            self.counted_boundaries()[self.REMAINDER_LABEL],
        )

    def test_the_mainland_narrative_quotes_the_same_total_as_the_table(self) -> None:
        """A third copy of the mainland figure sat further down saying 3,858."""
        narrative = re.search(
            r"`sources/rules/china-web\.list` and "
            r"`sources/rules/china-direct-curated\.list` carry ([\d,]+) rules",
            self.text,
        )
        self.assertIsNotNone(narrative, "the mainland narrative total is missing")
        self.assertEqual(
            int(narrative.group(1).replace(",", "")),
            self.counted_boundaries()[
                "Observation-derived mainland direct curation"
            ],
        )

class DocumentedRoutingOrderTests(unittest.TestCase):
    """The published tail diagram has to name the segments that are there.

    Both READMEs print the fixed tail order, and a reader uses it to reason
    about what wins. It drifted when ER-055 inserted overseas-shopping between
    Google and the mainland roots: the diagram kept its old shape and silently
    described a product one segment shorter than the one shipping.

    This checks the tail rather than the whole manifest, because that is the
    part the diagram claims to enumerate; everything before it is covered by the
    diagram's own first line, "all specific service rules".
    """

    # Each tail segment and a token the diagram must contain for it. The tokens
    # are what a reader would look for, not slugs, because the diagram is prose.
    TAIL_TOKENS = {
        "overseas-cloud": ("海外云服务", "overseas cloud"),
        "china-cloud": ("国内云服务", "domestic cloud"),
        "microsoft": ("微软服务", "Microsoft"),
        "google": ("Google", "Google"),
        "overseas-shopping": ("海外购物", "overseas shopping"),
        "china-direct-curated": ("大陆宽域根域", "broad mainland roots"),
        "china-geoip-direct": ("GEOIP,CN,DIRECT,no-resolve", "GEOIP,CN,DIRECT,no-resolve"),
        "final": ("漏网之鱼", "漏网之鱼"),
    }

    @classmethod
    def setUpClass(cls) -> None:
        cls.sources = load_profile_sources(SOURCES)

    def diagram(self, name: str) -> str:
        text = (ROOT / name).read_text(encoding="utf-8")
        marker = "全部具体业务规则" if name == "README.md" else "all concrete business rules"
        start = text.index(marker)
        return text[start : text.index("```", start)]

    def tail_slugs(self) -> "list[str]":
        segments = self.sources.segments_for("core")
        start = next(
            index
            for index, segment in enumerate(segments)
            if segment.slug == "overseas-cloud"
        )
        return [segment.slug for segment in segments[start:]]

    def test_the_diagram_names_every_tail_segment(self) -> None:
        for name, column in (("README.md", 0), ("README_EN.md", 1)):
            diagram = self.diagram(name)
            for slug in self.tail_slugs():
                if slug.endswith("late-recovery"):
                    continue  # counted collectively by the late-recovery line
                token = self.TAIL_TOKENS.get(slug)
                self.assertIsNotNone(
                    token, f"{slug} reaches the tail but {name} has no token for it"
                )
                self.assertIn(
                    token[column],
                    diagram,
                    f"{name} does not name {slug} in the routing order",
                )

    def test_the_diagram_does_not_name_a_segment_that_left(self) -> None:
        present = set(self.tail_slugs())
        for name, column in (("README.md", 0), ("README_EN.md", 1)):
            diagram = self.diagram(name)
            for slug, token in self.TAIL_TOKENS.items():
                if token[column] in diagram:
                    self.assertIn(
                        slug,
                        present,
                        f"{name} still names {slug}, which no longer reaches the tail",
                    )

    def test_the_late_recovery_line_counts_the_ones_that_are_there(self) -> None:
        non_microsoft = [
            segment.slug
            for segment in self.sources.rule_segments_for("core")
            if segment.slug.endswith("late-recovery")
            and not segment.slug.startswith("microsoft")
        ]
        self.assertEqual(len(non_microsoft), 5, "the diagram says five of them")
        self.assertIn("五个非微软 late-recovery", self.diagram("README.md"))
        self.assertIn("five non-Microsoft late-recovery", self.diagram("README_EN.md"))
