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
ISSUE_TEMPLATES = ROOT / ".github" / "ISSUE_TEMPLATE"
sys.path.insert(0, str(ROOT))

from scripts.profile_model import (  # noqa: E402
    HistoricalRule,
    ProfileError,
    compare_trees,
    coverage_metrics,
    first_match,
    load_profile_sources,
    parse_json_document,
    parse_rule,
    render_profile,
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
        self.assertEqual(len(self.sources.segments), 62)
        self.assertEqual(len(self.sources.rule_segments), 61)
        self.assertEqual(len(self.sources.proxy_groups), 36)
        self.assertEqual(len(self.sources.segments_for("core")), 62)
        self.assertEqual(len(self.sources.rule_segments_for("core")), 61)
        self.assertEqual(len(self.sources.proxy_groups_for("core")), 36)
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
                "🧲 OpenAI",
                "🧲 Claude",
                "🧲 海外 AI",
                "🔎 Google",
                "🗣 社交媒体",
                "📲 聊天软件",
                "🎙 Discord",
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
        nsfw_group = next(
            group for group in self.sources.proxy_groups if group.name == "🔞 NSFW"
        )
        self.assertEqual(
            list(nsfw_group.members),
            ["REJECT", "♻️ 手动切换", "DIRECT", "__ALL_SUBSCRIPTION_NODES__"],
        )
        self.assertEqual(
            [
                segment.slug
                for segment in self.sources.segments
                if segment.target == "🎵 音乐平台"
            ],
            [
                "tidal",
                "spotify",
                "spotify-2",
                "qobuz",
                "apple-music",
            ],
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
        self.assertLessEqual(
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
        for owner, record in self.ledger["owners"].items():
            rules = emitted_by_owner[owner]
            path = SOURCES / "rules" / f"{record['recovery_slug']}.list"
            self.assertEqual(path.read_text(encoding="utf-8").splitlines(), rules)
            self.assertEqual(len(rules), record["rules"])
            self.assertEqual(
                hashlib.sha256(path.read_bytes()).hexdigest(),
                record["file_sha256"],
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
        self.assertEqual(
            [segment.slug for segment in sources.segments[-10:]],
            [
                *self.ledger["tail_order"][:-1],
                "china-domains-direct",
                "china-geoip-direct",
                "final",
            ],
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
        self.assertEqual(
            mihomo_groups["🔞 NSFW"][:3],
            ["REJECT", "♻️ 手动切换", "DIRECT"],
        )
        subconverter = (
            GENERATED / "config" / "ekko-rules.ini"
        ).read_text(encoding="utf-8")
        self.assertIn(
            "custom_proxy_group=🔞 NSFW`select`[]REJECT`[]♻️ 手动切换`[]DIRECT`",
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
        for domain in self.ledger["required_cases"].values():
            with self.subTest(domain=domain):
                result = first_match(self.sources, domain=domain)
                self.assertEqual(result["slug"], "china-domains-direct")
                self.assertEqual(result["target"], "🌏 国内网站")


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
