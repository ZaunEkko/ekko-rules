from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from collections import Counter
from pathlib import Path
from typing import Any

import yaml


ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = ROOT / "scripts"
SOURCES = ROOT / "sources"
GENERATED = ROOT / "generated" / "reversed-profile"
PHASE_2_BEFORE = ROOT / "tests" / "fixtures" / "phase-2-before.json"
PHASE_2_AFTER = ROOT / "tests" / "fixtures" / "phase-2-after.json"
PHASE_2_LEDGER = ROOT / "tests" / "fixtures" / "phase-2-migration-ledger.json"
PHASE_3_BEFORE = ROOT / "tests" / "fixtures" / "phase-3-before.json"
PHASE_3_AFTER = ROOT / "tests" / "fixtures" / "phase-3-after.json"
PHASE_3_DESIGN = ROOT / "tests" / "fixtures" / "phase-3-design.json"
PHASE_3_LEDGER = ROOT / "tests" / "fixtures" / "phase-3-migration-ledger.json"
PHASE_3_RECOVERY_LEDGER = (
    ROOT / "tests" / "fixtures" / "phase-3-recovery-ledger.json"
)
CHINA_DOMAIN_IMPORT_LEDGER = (
    ROOT / "tests" / "fixtures" / "china-domain-import-ledger.json"
)
ADVERTISING_IMPORT_LEDGER = (
    ROOT / "tests" / "fixtures" / "advertising-import-ledger.json"
)
ADVERTISING_ROUTING_LEDGER = (
    ROOT / "tests" / "fixtures" / "advertising-routing-ledger.json"
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
    first_match,
    load_profile_sources,
    parse_json_document,
    parse_rule,
    render_profile,
    rule_covers,
    select_late_recovery,
)


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
        self.assertEqual(len(self.sources.proxy_groups), 40)
        self.assertEqual(len(self.sources.segments_for("core")), 64)
        self.assertEqual(len(self.sources.rule_segments_for("core")), 63)
        self.assertEqual(len(self.sources.proxy_groups_for("core")), 40)
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
                "🖥️ 远程串流",
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
                "🎬 爱奇艺",
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
            "🖥️ 远程串流": [
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
                "DIRECT",
                "♻️ 手动切换",
                "__ALL_SUBSCRIPTION_NODES__",
            ],
            "🍎 苹果服务": [
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
                "remote-streaming",
                "advertising",
                "openai",
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
            ["hbo-go", "hbo-max"],
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
        self.assertLess(slugs.index("advertising"), slugs.index("overseas-cloud"))
        self.assertLess(slugs.index("china-media-late-recovery"), slugs.index("overseas-cloud"))
        self.assertLess(slugs.index("overseas-cloud"), slugs.index("china-cloud"))
        self.assertLess(slugs.index("china-cloud"), slugs.index("microsoft"))
        self.assertLess(slugs.index("microsoft-late-recovery"), slugs.index("google"))
        self.assertLess(slugs.index("google"), slugs.index("china-domains-direct"))

    def test_cloud_capture_ledger_is_frozen_and_closed(self) -> None:
        ledger = json.loads(CLOUD_ROUTING_LEDGER.read_text(encoding="utf-8"))
        self.assertEqual(ledger["schema_version"], 1)
        self.assertEqual(ledger["count"], 57)
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
            Counter({"china-cloud": 54, "overseas-cloud": 3}),
        )
        self.assertEqual(
            Counter(row["later_slug"] for row in actual),
            Counter({"china-domains-direct": 42, "microsoft-late-recovery": 15}),
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
        before = json.loads(PHASE_2_BEFORE.read_text(encoding="utf-8"))
        baseline = self.sources.quality_baseline["products"]["core"][
            "first_match_unreachable"
        ]
        current = coverage_metrics(self.sources, product="core")
        self.assertEqual(current, baseline)
        self.assertLess(
            current["global"]["union"],
            before["summary"]["coverage"]["global"]["union"],
        )
        self.assertLess(
            current["within_same_segment"]["union"],
            before["summary"]["coverage"]["within_same_segment"]["union"],
        )
        self.assertEqual(current["global"]["union"], 133)
        self.assertEqual(current["within_same_segment"]["union"], 13)
        self.assertEqual(current["cross_segment_only"]["union"], 120)
        self.assertLess(
            current["cross_segment_only"]["union"],
            before["summary"]["coverage"]["cross_segment_only"]["union"],
        )

    def test_direct_default_domain_keyword_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            source_copy = Path(temporary) / "sources"
            shutil.copytree(SOURCES, source_copy)
            microsoft = source_copy / "rules" / "microsoft.list"
            microsoft.write_text(
                microsoft.read_text(encoding="utf-8")
                + "DOMAIN-KEYWORD,microsoft\n",
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


class PhaseTwoMigrationBaselineTests(unittest.TestCase):
    def test_pre_migration_fixture_is_complete_and_immutable(self) -> None:
        fixture = json.loads(PHASE_2_BEFORE.read_text(encoding="utf-8"))
        self.assertEqual(fixture["schema_version"], 1)
        self.assertEqual(fixture["baseline"], "phase-2-pre-migration")
        self.assertEqual(
            hashlib.sha256(PHASE_2_BEFORE.read_bytes()).hexdigest(),
            "7719de7335aa4af647914242bf1f7892b7477bad31407ef04c9e68bfb6fc883b",
        )
        self.assertEqual(len(fixture["rule_files"]), 42)
        self.assertEqual(len(fixture["segment_order"]), 43)
        self.assertEqual(len(fixture["proxy_group_order"]), 42)
        self.assertEqual(len(fixture["cases"]), 44)
        self.assertEqual(
            fixture["summary"],
            {
                "segments": 43,
                "rulesets": 42,
                "groups": 42,
                "rules": 15541,
                "destination_ip_rules": 2205,
                "coverage": {
                    "global": {
                        "exact_occurrences": 1666,
                        "broad_coverage_occurrences": 1157,
                        "overlap_between_categories": 334,
                        "union": 2489,
                    },
                    "within_same_segment": {
                        "exact_occurrences": 0,
                        "broad_coverage_occurrences": 1035,
                        "overlap_between_categories": 0,
                        "union": 1035,
                    },
                    "cross_segment_only": {"union": 1454},
                },
            },
        )

    def test_migration_ledger_is_closed_and_immutable(self) -> None:
        ledger = json.loads(PHASE_2_LEDGER.read_text(encoding="utf-8"))
        self.assertEqual(
            hashlib.sha256(PHASE_2_LEDGER.read_bytes()).hexdigest(),
            "8991349e524221cae5ab65574234446583b83370e27aa8a3fb344f1237576872",
        )
        self.assertEqual(ledger["old_rules"], 15540)
        self.assertEqual(ledger["extended_rules"], 15517)
        self.assertEqual(ledger["core_rules"], 15411)
        self.assertEqual(ledger["extended_only_rules"], 106)
        self.assertEqual(ledger["removed_occurrences"], 23)
        self.assertEqual(ledger["added_rules"], 0)
        self.assertEqual(
            ledger["old_rules"],
            ledger["extended_rules"] + ledger["removed_occurrences"],
        )
        self.assertEqual(
            ledger["extended_rules"],
            ledger["core_rules"] + ledger["extended_only_rules"],
        )

        before = json.loads(PHASE_2_BEFORE.read_text(encoding="utf-8"))
        phase_2 = json.loads(PHASE_3_BEFORE.read_text(encoding="utf-8"))

        def historical_rules(head: str, filenames: list[str]) -> list[str]:
            result: list[str] = []
            for filename in sorted(filenames):
                completed = subprocess.run(
                    [
                        "git",
                        "show",
                        f"{head}:sources/rules/{filename}",
                    ],
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                )
                self.assertEqual(completed.returncode, 0, completed.stderr)
                result.extend(completed.stdout.splitlines())
            return result

        old_rules = historical_rules(before["head"], list(before["rule_files"]))
        extended_rules = historical_rules(
            phase_2["head"],
            list(phase_2["rule_files"]),
        )
        core_files = [
            f"{segment['slug']}.list"
            for segment in phase_2["segment_order"]
            if segment["scope"] == "core" and segment["slug"] != "final"
        ]
        core_rules = historical_rules(phase_2["head"], core_files)
        removed = Counter(
            {
                item["rule"]: item["occurrences_removed"]
                for item in ledger["removed"]
            }
        )
        self.assertEqual(Counter(old_rules), Counter(extended_rules) + removed)
        self.assertEqual(
            Counter(extended_rules),
            Counter(core_rules) + (Counter(extended_rules) - Counter(core_rules)),
        )

    def test_post_migration_fixture_is_complete_and_immutable(self) -> None:
        fixture = json.loads(PHASE_2_AFTER.read_text(encoding="utf-8"))
        self.assertEqual(fixture["schema_version"], 1)
        self.assertEqual(fixture["baseline"], "phase-2-post-migration")
        self.assertEqual(
            hashlib.sha256(PHASE_2_AFTER.read_bytes()).hexdigest(),
            "954f66f1e202650c83a39484b26273f78b04107d0d91abbf64d05e47cda63147",
        )
        self.assertEqual(fixture["products"]["core"]["summary"]["rules"], 15412)
        self.assertEqual(
            fixture["products"]["extended"]["summary"]["rules"],
            15518,
        )
        for expected in fixture["products"].values():
            self.assertEqual(len(expected["cases"]), 44)


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
            self.assertLess(slugs.index(slug), slugs.index("china-domains-direct"))
        for slug in recovery_slugs:
            if slug != "microsoft-late-recovery":
                self.assertLess(slugs.index(slug), slugs.index("overseas-cloud"))
        self.assertLess(slugs.index("microsoft"), slugs.index("microsoft-late-recovery"))
        self.assertLess(slugs.index("microsoft-late-recovery"), slugs.index("google"))
        self.assertEqual(
            slugs[-3:],
            ["china-domains-direct", "china-geoip-direct", "final"],
        )
        group_members = {
            group.name: list(group.members) for group in sources.proxy_groups
        }
        for record in self.ledger["owners"].values():
            self.assertEqual(group_members[record["target"]][0], "DIRECT")
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
            mihomo_groups["🖥️ 远程串流"][:2],
            ["DIRECT", "♻️ 手动切换"],
        )
        self.assertEqual(
            mihomo_groups["🧑‍💻 开发服务"][:2],
            ["♻️ 手动切换", "DIRECT"],
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
        self.assertIn(
            "custom_proxy_group=🖥️ 远程串流`select`[]DIRECT`"
            "[]♻️ 手动切换`",
            subconverter,
        )
        self.assertIn(
            "custom_proxy_group=🧑‍💻 开发服务`select`[]♻️ 手动切换`"
            "[]DIRECT`",
            subconverter,
        )
        self.assertIn(
            "ruleset=🖥️ 远程串流,https://raw.githubusercontent.com/"
            "ZaunEkko/ekko-rules/main/generated/reversed-profile/Ruleset/"
            "remote-streaming.list",
            subconverter,
        )
        self.assertEqual(
            mihomo["rules"][-3:],
            [
                "RULE-SET,china-domains-direct,🌏 国内网站",
                "RULE-SET,china-geoip-direct,DIRECT",
                "MATCH,🐟 漏网之鱼",
            ],
        )


class AdvertisingImportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.sources = load_profile_sources(SOURCES)
        cls.ledger = json.loads(ADVERTISING_IMPORT_LEDGER.read_text(encoding="utf-8"))
        cls.rules_path = SOURCES / "rules" / "advertising.list"
        cls.rules = cls.rules_path.read_text(encoding="utf-8").splitlines()

    def test_import_ledger_and_output_are_immutable(self) -> None:
        self.assertEqual(
            hashlib.sha256(ADVERTISING_IMPORT_LEDGER.read_bytes()).hexdigest(),
            "2072cbc7408a435d572d23e116e817a3ed4f5704cbac0e04efcb4f14eab809ff",
        )
        selection = self.ledger["selection"]
        self.assertEqual(selection["resolved_entries"], 850)
        self.assertEqual(selection["excluded"]["regexp"], 1)
        self.assertEqual(selection["emitted"], 849)
        self.assertEqual(
            selection["emitted_rule_types"],
            {"DOMAIN": 172, "DOMAIN-SUFFIX": 677},
        )
        self.assertEqual(
            hashlib.sha256(self.rules_path.read_bytes()).hexdigest(),
            selection["emitted_sha256"],
        )
        self.assertEqual(len(self.rules), selection["emitted"])
        upstream = next(
            item
            for item in self.sources.upstreams["upstreams"]
            if item["id"] == "v2fly-domain-list-community-advertising"
        )
        self.assertEqual(upstream["revision"], self.ledger["source"]["revision"])
        self.assertEqual(
            upstream["license_sha256"], self.ledger["source"]["license_sha256"]
        )
        self.assertEqual(upstream["category"], self.ledger["source"]["category"])
        self.assertEqual(upstream["output_path"], "rules/advertising.list")
        self.assertEqual(
            upstream["ledger"], "tests/fixtures/advertising-import-ledger.json"
        )

    def test_import_is_anchored_and_defaults_to_reject(self) -> None:
        for rule in self.rules:
            rule_type, value, has_no_resolve = parse_rule(
                rule, context="Advertising import"
            )
            self.assertIn(rule_type, {"DOMAIN", "DOMAIN-SUFFIX"})
            self.assertIn(".", value)
            self.assertFalse(has_no_resolve)
        group = next(
            group for group in self.sources.proxy_groups if group.name == "🛑 广告拦截"
        )
        self.assertEqual(group.members[0], "REJECT")

    def test_required_advertising_cases_match_before_services(self) -> None:
        for domain in self.ledger["required_cases"].values():
            with self.subTest(domain=domain):
                result = first_match(self.sources, domain=domain)
                self.assertEqual(result["slug"], "advertising")
                self.assertEqual(result["target"], "🛑 广告拦截")

    def test_intentional_cross_segment_captures_are_frozen(self) -> None:
        self.assertEqual(
            hashlib.sha256(ADVERTISING_ROUTING_LEDGER.read_bytes()).hexdigest(),
            "91dba828281abdf706baaf1cf7c55c0db757758e735ddb5727ef395cfefc7262",
        )
        ledger = json.loads(
            ADVERTISING_ROUTING_LEDGER.read_text(encoding="utf-8")
        )
        advertising = self.sources.rules["advertising"]
        segments = self.sources.rule_segments_for("core")
        start = next(
            index for index, segment in enumerate(segments) if segment.slug == "advertising"
        )
        rows = []
        for segment in segments[start + 1 :]:
            for rule in self.sources.rules[segment.slug]:
                covering = next(
                    (
                        candidate
                        for candidate in advertising
                        if rule_covers(candidate, rule)
                    ),
                    None,
                )
                if covering:
                    rows.append(
                        {
                            "later_slug": segment.slug,
                            "later_target": segment.target,
                            "later_rule": rule,
                            "advertising_rule": covering,
                        }
                    )
        def row_key(row: dict[str, str]) -> tuple[str, str, str, str]:
            return (
                row["later_slug"],
                row["later_target"],
                row["later_rule"],
                row["advertising_rule"],
            )

        ordered_rows = sorted(rows, key=row_key)
        ordered_ledger_rows = sorted(ledger["rows"], key=row_key)
        self.assertEqual(ordered_rows, ordered_ledger_rows)
        self.assertEqual(len(rows), ledger["count"])
        ledger_content = "".join(
            f"{row['later_slug']}\t{row['later_target']}\t{row['later_rule']}\t"
            f"{row['advertising_rule']}\n"
            for row in ledger["rows"]
        )
        self.assertEqual(
            hashlib.sha256(ledger_content.encode()).hexdigest(),
            ledger["rows_sha256"],
        )


class PublicRuleExclusionTests(unittest.TestCase):
    def test_exclusion_ledger_is_immutable_and_closed(self) -> None:
        self.assertEqual(
            hashlib.sha256(PUBLIC_RULE_EXCLUSIONS.read_bytes()).hexdigest(),
            "b7a78bb1879a8294fb665538cacfad7b69eca531b7092efc1da635e3f289a404",
        )
        ledger = json.loads(PUBLIC_RULE_EXCLUSIONS.read_text(encoding="utf-8"))
        removed = [
            *ledger["removed"]["provider_override"],
            *ledger["removed"]["late_recovery"],
        ]
        self.assertEqual(len(removed), ledger["counts"]["total"])
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


class ChinaDomainDirectImportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.sources = load_profile_sources(SOURCES)
        cls.ledger = json.loads(CHINA_DOMAIN_IMPORT_LEDGER.read_text(encoding="utf-8"))
        cls.rules_path = SOURCES / "rules" / "china-domains-direct.list"
        cls.rules = cls.rules_path.read_text(encoding="utf-8").splitlines()

    def test_import_ledger_and_output_are_immutable(self) -> None:
        self.assertEqual(
            hashlib.sha256(CHINA_DOMAIN_IMPORT_LEDGER.read_bytes()).hexdigest(),
            "7de6a96aa36ea4b3db92899843f19419609edb11dc484879621e4f58f9a3af6b",
        )
        selection = self.ledger["selection"]
        self.assertEqual(selection["emitted"], 1482)
        self.assertEqual(selection["emitted_rule_types"], {"DOMAIN-SUFFIX": 1481, "DOMAIN": 1})
        self.assertEqual(
            hashlib.sha256(self.rules_path.read_bytes()).hexdigest(),
            selection["emitted_sha256"],
        )
        self.assertEqual(len(self.rules), selection["emitted"])

    def test_import_is_anchored_and_contains_no_geosite(self) -> None:
        for rule in self.rules:
            rule_type, value, has_no_resolve = parse_rule(
                rule, context="China domain import"
            )
            self.assertIn(rule_type, {"DOMAIN", "DOMAIN-SUFFIX"})
            self.assertIn(".", value)
            self.assertFalse(has_no_resolve)
            self.assertNotEqual(rule_type, "DOMAIN-KEYWORD")
        self.assertFalse(any("GEOSITE" in rule for rule in self.rules))

    def test_required_mainland_service_cases_match_before_final(self) -> None:
        migrated_cloud_cases = {
            "www.cloudflare-cn.com": (
                "china-cloud",
                "☁️ 国内云服务",
                "DOMAIN-SUFFIX,cloudflare-cn.com",
            ),
        }
        for domain in self.ledger["required_cases"].values():
            with self.subTest(domain=domain):
                result = first_match(self.sources, domain=domain)
                expected = migrated_cloud_cases.get(domain)
                if expected is None:
                    self.assertEqual(result["slug"], "china-domains-direct")
                    self.assertEqual(result["target"], "🌏 国内网站")
                else:
                    self.assertEqual(
                        (result["slug"], result["target"], result["rule"]),
                        expected,
                    )


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
                ("xai", "🧲 海外 AI", "DOMAIN-SUFFIX,x.ai"),
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
                    "🎬 爱奇艺",
                    "DOMAIN-SUFFIX,71.am.com",
                ),
                "www.71.am.com",
            ),
            (
                (
                    "microsoft-late-recovery",
                    "🧩 微软服务",
                    "DOMAIN-SUFFIX,21vbc.com",
                ),
                "www.21vbc.com",
            ),
            (
                (
                    "apple-late-recovery",
                    "🍎 苹果服务",
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
            ("DOMAIN-SUFFIX,zaunekko.com",),
        )
        self.assert_match(
            (
                "author-domain",
                "🌏 国内网站",
                "DOMAIN-SUFFIX,zaunekko.com",
            ),
            domain="zaunekko.com",
        )

    def test_remote_streaming_is_direct_first(self) -> None:
        domain_cases = [
            ("DOMAIN-SUFFIX,tailscale.com", "login.tailscale.com"),
            ("DOMAIN-SUFFIX,tailscale.io", "control.tailscale.io"),
            ("DOMAIN-SUFFIX,ts.net", "host.example.ts.net"),
            ("DOMAIN,root-tok-01.zerotier.com", "root-tok-01.zerotier.com"),
            ("DOMAIN-SUFFIX,teamviewer.com", "router1.teamviewer.com"),
        ]
        for rule, domain in domain_cases:
            with self.subTest(domain=domain):
                self.assert_match(
                    ("remote-streaming", "🖥️ 远程串流", rule),
                    domain=domain,
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
                        "🖥️ 远程串流",
                        f"PROCESS-NAME,{process_name}",
                    ),
                    process_name=process_name,
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
        }
        for domain, rule in mainland_cases.items():
            with self.subTest(domain=domain):
                self.assert_match(
                    ("china-web", "🌏 国内网站", rule),
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
                        "advertising",
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
                    ("china-domains-direct", "🌏 国内网站", rule),
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
                "🖥️ 远程串流",
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
            "console.qingcloud.com": "DOMAIN-SUFFIX,qingcloud.com",
            "bucket.bcebos.com": "DOMAIN-SUFFIX,bcebos.com",
            "console.jdcloud.com": "DOMAIN-SUFFIX,jdcloud.com",
            "console.ksyun.com": "DOMAIN-SUFFIX,ksyun.com",
            "console.amazonaws.cn": "DOMAIN-SUFFIX,amazonaws.cn",
            "s3.cn-north-1.amazonaws.com.cn": "DOMAIN-SUFFIX,amazonaws.com.cn",
            "portal.azure.cn": "DOMAIN-SUFFIX,azure.cn",
            "edge.cloudflarechina.cn": "DOMAIN-SUFFIX,cloudflarechina.cn",
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
            "bucket.oss-accelerate-overseas.aliyuncs.com": "DOMAIN-SUFFIX,oss-accelerate-overseas.aliyuncs.com",
            "intl.cloud.tencent.com": "DOMAIN,intl.cloud.tencent.com",
            "www.tencentcloud.com": "DOMAIN-SUFFIX,tencentcloud.com",
            "console.tencentcloud.com": "DOMAIN-SUFFIX,tencentcloud.com",
            "bucket.cos.ap-singapore.myqcloud.com": "DOMAIN-SUFFIX,cos.ap-singapore.myqcloud.com",
            "obs.ap-southeast-3.myhuaweicloud.com": "DOMAIN-SUFFIX,ap-southeast-3.myhuaweicloud.com",
            "console.aws.amazon.com": "DOMAIN-SUFFIX,console.aws.amazon.com",
            "us-east-1.console.aws.amazon.com": "DOMAIN-SUFFIX,console.aws.amazon.com",
            "eu-west-1.console.aws.amazon.com": "DOMAIN-SUFFIX,console.aws.amazon.com",
            "s3.us-east-1.amazonaws.com": "DOMAIN-SUFFIX,amazonaws.com",
            "portal.azure.com": "DOMAIN-SUFFIX,azure.com",
            "console.cloud.google.com": "DOMAIN-SUFFIX,cloud.google.com",
            "cloudresourcemanager.googleapis.com": "DOMAIN,cloudresourcemanager.googleapis.com",
            "compute.googleapis.com": "DOMAIN,compute.googleapis.com",
            "storage.googleapis.com": "DOMAIN,storage.googleapis.com",
            "compute.europe-west1.rep.googleapis.com": "DOMAIN-SUFFIX,rep.googleapis.com",
            "example.workers.dev": "DOMAIN-SUFFIX,workers.dev",
            "www.digitalocean.com": "DOMAIN-SUFFIX,digitalocean.com",
            "www.vultr.com": "DOMAIN-SUFFIX,vultr.com",
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

        shared_google_api_cases = {
            "fonts.googleapis.com": "DOMAIN-SUFFIX,googleapis.com",
            "people.googleapis.com": "DOMAIN-SUFFIX,googleapis.com",
        }
        for domain, rule in shared_google_api_cases.items():
            with self.subTest(domain=domain):
                self.assert_match(
                    ("google", "🔎 Google", rule),
                    domain=domain,
                )

        priority_cases = {
            "gmeconf.qcloud.com": (
                "game-platform",
                "🎮 游戏平台",
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
                    ("advertising", "🛑 广告拦截", rule),
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
            "down.val.qq.com": "DOMAIN-SUFFIX,val.qq.com",
            "cn.voice.gcloudcs.com": "DOMAIN-SUFFIX,gcloudcs.com",
            "gmeconf.qcloud.com": "DOMAIN,gmeconf.qcloud.com",
            "qcloud.rtc.qq.com": "DOMAIN,qcloud.rtc.qq.com",
        }
        for domain, rule in game_cases.items():
            with self.subTest(domain=domain):
                self.assert_match(
                    ("game-platform", "🎮 游戏平台", rule),
                    domain=domain,
                )

        media_cases = {
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
                    ("china-web", "🌏 国内网站", rule),
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
                    ("advertising", "🛑 广告拦截", rule),
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
                    ("china-domains-direct", "🌏 国内网站", rule),
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
        }
        for domain, rule in cases.items():
            with self.subTest(domain=domain):
                self.assert_match(
                    ("developer-platforms", "🧑‍💻 开发服务", rule),
                    domain=domain,
                )
        self.assert_match(
            (
                "china-domains-direct",
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
                "onedrive": "cloud-storage",
                "icloud": "cloud-storage",
                "spotify-2": "spotify",
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
            for alias, canonical_slug in GENERATED_RULESET_ALIASES.items():
                with self.subTest(alias=alias):
                    self.assertEqual(
                        (output / "Ruleset" / f"{alias}.list").read_bytes(),
                        (output / "Ruleset" / f"{canonical_slug}.list").read_bytes(),
                    )
                    self.assertEqual(
                        (
                            output / "Providers" / "Ruleset" / f"{alias}.yaml"
                        ).read_bytes(),
                        (
                            output
                            / "Providers"
                            / "Ruleset"
                            / f"{canonical_slug}.yaml"
                        ).read_bytes(),
                    )
                    self.assertIn(f"Ruleset/{alias}.list", generated_manifest)
                    self.assertIn(
                        f"Providers/Ruleset/{alias}.yaml", generated_manifest
                    )
                    self.assertNotIn(f"/{alias}.list", active_text)
                    self.assertNotIn(f"/{alias}.yaml", active_text)
                    self.assertNotIn(f"RULE-SET,{alias},", active_text)
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


class LegacyImporterTests(unittest.TestCase):
    def write_profile(
        self,
        path: Path,
        *,
        group_members: list[str],
        rules: list[str],
    ) -> None:
        profile = {
            "mixed-port": 7890,
            "allow-lan": False,
            "mode": "rule",
            "log-level": "warning",
            "proxies": [
                {"name": "n1", "type": "ss", "server": "example.com", "port": 443, "password": "secret"},
                {"name": "n2", "type": "ss", "server": "example.net", "port": 443, "password": "secret"},
            ],
            "proxy-groups": [
                {"name": "🐟 漏网之鱼", "type": "select", "proxies": group_members}
            ],
            "rules": rules,
        }
        path.write_text(
            yaml.safe_dump(profile, allow_unicode=True, sort_keys=False),
            encoding="utf-8",
            newline="\n",
        )

    def run_importer(self, profile: Path, output: Path) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [
                sys.executable,
                str(SCRIPTS / "reverse_profile.py"),
                str(profile),
                str(output),
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
        )

    def test_final_target_rule_before_match_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            profile = root / "profile.yaml"
            output = root / "candidate"
            self.write_profile(
                profile,
                group_members=["n1", "n2"],
                rules=[
                    "DOMAIN,only-final.example,🐟 漏网之鱼",
                    "MATCH,🐟 漏网之鱼",
                ],
            )
            completed = self.run_importer(profile, output)
            self.assertEqual(completed.returncode, 2)
            self.assertFalse(output.exists())

    def test_partial_node_group_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            profile = root / "profile.yaml"
            output = root / "candidate"
            self.write_profile(
                profile,
                group_members=["n1"],
                rules=["MATCH,🐟 漏网之鱼"],
            )
            completed = self.run_importer(profile, output)
            self.assertEqual(completed.returncode, 2)
            self.assertFalse(output.exists())

    def test_failed_import_leaves_no_candidate_or_staging(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            profile = root / "profile.yaml"
            output = root / "candidate"
            self.write_profile(
                profile,
                group_members=["n1", "n2"],
                rules=["DOMAIN-KEYWORD,example,DIRECT", "MATCH,🐟 漏网之鱼"],
            )
            completed = self.run_importer(profile, output)
            self.assertEqual(completed.returncode, 2)
            self.assertFalse(output.exists())
            self.assertEqual(list(root.glob(".candidate.stage-*")), [])

    def test_empty_proxy_list_returns_controlled_failure(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            profile = root / "profile.yaml"
            output = root / "candidate"
            self.write_profile(
                profile,
                group_members=[],
                rules=["MATCH,🐟 漏网之鱼"],
            )
            data = yaml.safe_load(profile.read_text(encoding="utf-8"))
            data["proxies"] = []
            profile.write_text(
                yaml.safe_dump(data, allow_unicode=True, sort_keys=False),
                encoding="utf-8",
                newline="\n",
            )
            completed = self.run_importer(profile, output)
            self.assertEqual(completed.returncode, 2)
            self.assertNotIn("Traceback", completed.stderr)
            self.assertFalse(output.exists())

    def test_successful_import_generates_and_validates(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            profile = root / "profile.yaml"
            sources = root / "candidate"
            generated = root / "generated"
            self.write_profile(
                profile,
                group_members=["n1", "n2"],
                rules=[
                    "DOMAIN-SUFFIX,example.org,DIRECT",
                    "MATCH,🐟 漏网之鱼",
                ],
            )
            imported = self.run_importer(profile, sources)
            self.assertEqual(imported.returncode, 0, imported.stderr)
            load_profile_sources(sources)
            rendered = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPTS / "generate_profile.py"),
                    "--sources",
                    str(sources),
                    "--output",
                    str(generated),
                ],
                capture_output=True,
                text=True,
                encoding="utf-8",
            )
            self.assertEqual(rendered.returncode, 0, rendered.stderr)
            validated = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPTS / "validate_generated.py"),
                    "--sources",
                    str(sources),
                    "--generated",
                    str(generated),
                ],
                capture_output=True,
                text=True,
                encoding="utf-8",
            )
            self.assertEqual(validated.returncode, 0, validated.stderr)


if __name__ == "__main__":
    unittest.main()
