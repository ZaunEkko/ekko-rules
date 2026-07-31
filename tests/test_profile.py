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

import yaml


ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = ROOT / "scripts"
SOURCES = ROOT / "sources"
GENERATED = ROOT / "generated" / "reversed-profile"
PHASE_2_BEFORE = ROOT / "tests" / "fixtures" / "phase-2-before.json"
PHASE_2_AFTER = ROOT / "tests" / "fixtures" / "phase-2-after.json"
PHASE_2_LEDGER = ROOT / "tests" / "fixtures" / "phase-2-migration-ledger.json"
sys.path.insert(0, str(ROOT))

from scripts.profile_model import (  # noqa: E402
    ProfileError,
    compare_trees,
    coverage_metrics,
    first_match,
    load_profile_sources,
    parse_json_document,
    render_profile,
)


class CanonicalSourceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.sources = load_profile_sources(SOURCES)

    def test_shape_and_order_snapshot(self) -> None:
        self.assertEqual(len(self.sources.segments), 58)
        self.assertEqual(len(self.sources.rule_segments), 57)
        self.assertEqual(len(self.sources.proxy_groups), 45)
        self.assertEqual(len(self.sources.segments_for("core")), 52)
        self.assertEqual(len(self.sources.rule_segments_for("core")), 51)
        self.assertEqual(len(self.sources.proxy_groups_for("core")), 44)
        self.assertEqual(self.sources.terminal.slug, "final")
        self.assertEqual(self.sources.terminal.target, "🐟 漏网之鱼")
        self.assertEqual(
            [
                segment.slug
                for segment in self.sources.segments
                if segment.target == "🎵 音乐平台"
            ],
            [
                "tidal",
                "spotify",
                "spotify-legacy",
                "spotify-2",
                "qobuz-brand-defense",
                "qobuz",
                "qobuz-brand-defense-2",
                "apple-music",
            ],
        )

    def test_no_resolve_and_strict_cidr_gate(self) -> None:
        for product in ("core", "extended"):
            self.assertEqual(
                self.sources.quality_baseline["products"][product]["scope"][
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
        for product in ("core", "extended"):
            baseline = self.sources.quality_baseline["products"][product][
                "first_match_unreachable"
            ]
            current = coverage_metrics(self.sources, product=product)
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

    def test_scope_drift_is_rejected_by_frozen_baseline(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            source_copy = Path(temporary) / "sources"
            shutil.copytree(SOURCES, source_copy)
            manifest = source_copy / "manifest.yaml"
            manifest.write_text(
                manifest.read_text(encoding="utf-8").replace(
                    "slug: spotify-legacy\n  target: 🎵 音乐平台\n  source: rules/spotify-legacy.list\n  scope: optional",
                    "slug: spotify-legacy\n  target: 🎵 音乐平台\n  source: rules/spotify-legacy.list\n  scope: core",
                    1,
                ),
                encoding="utf-8",
                newline="\n",
            )
            with self.assertRaisesRegex(ProfileError, "scope differs"):
                load_profile_sources(source_copy)

    def test_sensitive_or_nonportable_source_fields_are_rejected(self) -> None:
        mutations = [
            ("manifest.yaml", "https://raw.githubusercontent.com/", "https://user:secret@raw.githubusercontent.com/"),
            ("manifest.yaml", "/Ruleset", "/Ruleset?X-Amz-Signature=secret"),
            ("proxy-groups.yaml", "path: ./proxy_provider/subscription.yaml", "path: /home/alice/private-subscription.yaml"),
            ("proxy-groups.yaml", "https://www.gstatic.com/generate_204", "https://example.com/check?X-Amz-Signature=secret"),
            ("base.yaml", "mixed-port: 7890", "mixed-port: true"),
            ("base.yaml", "log-level: warning", "log-level: ghp_" + "a" * 36),
            ("base.yaml", "external-controller: 127.0.0.1:9090", "external-controller: /mnt/alice/private.sock"),
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
        old_rules: list[str] = []
        for filename in sorted(before["rule_files"]):
            completed = subprocess.run(
                [
                    "git",
                    "show",
                    f"{before['head']}:sources/rules/{filename}",
                ],
                capture_output=True,
                text=True,
                encoding="utf-8",
            )
            self.assertEqual(completed.returncode, 0, completed.stderr)
            old_rules.extend(completed.stdout.splitlines())

        sources = load_profile_sources(SOURCES)
        core_rules = [
            rule
            for segment in sources.rule_segments_for("core")
            for rule in sources.rules[segment.slug]
        ]
        extended_rules = [
            rule
            for segment in sources.rule_segments_for("extended")
            for rule in sources.rules[segment.slug]
        ]
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

    def test_post_migration_products_match_frozen_behavior(self) -> None:
        fixture = json.loads(PHASE_2_AFTER.read_text(encoding="utf-8"))
        self.assertEqual(fixture["schema_version"], 1)
        self.assertEqual(fixture["baseline"], "phase-2-post-migration")
        self.assertEqual(
            hashlib.sha256(PHASE_2_AFTER.read_bytes()).hexdigest(),
            "954f66f1e202650c83a39484b26273f78b04107d0d91abbf64d05e47cda63147",
        )
        sources = load_profile_sources(SOURCES)
        for product, expected in fixture["products"].items():
            self.assertEqual(len(expected["cases"]), 44)
            self.assertEqual(
                expected["summary"]["coverage"],
                coverage_metrics(sources, product=product),
            )
            for case in expected["cases"]:
                with self.subTest(product=product, case=case["id"]):
                    self.assertEqual(
                        first_match(
                            sources,
                            product=product,
                            **case["input"],
                        ),
                        case["result"],
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

    def test_overbroad_domain_rules_fall_back_to_general_policies(self) -> None:
        cases = [
            (("global-web", "🌏 国外网站", "DOMAIN-SUFFIX,jp"), "example.jp"),
            (("global-web", "🌏 国外网站", "DOMAIN-SUFFIX,kr"), "example.kr"),
            (("final", "🐟 漏网之鱼", "MATCH"), "blackfridaysale.example"),
            (("final", "🐟 漏网之鱼", "MATCH"), "unrelated-ntt.example"),
            (
                ("global-web", "🌏 国外网站", "DOMAIN-SUFFIX,hinet.net"),
                "mail.hinet.net",
            ),
            (
                ("global-web", "🌏 国外网站", "DOMAIN-SUFFIX,gvt1.com"),
                "download.gvt1.com",
            ),
            (
                ("global-web", "🌏 国外网站", "DOMAIN-SUFFIX,sentry.io"),
                "app.sentry.io",
            ),
            (
                (
                    "global-web",
                    "🌏 国外网站",
                    "DOMAIN-SUFFIX,players.brightcove.net",
                ),
                "players.brightcove.net",
            ),
        ]
        for expected, domain in cases:
            with self.subTest(domain=domain):
                self.assert_match(expected, domain=domain)

    def test_shared_cloud_cidrs_fall_back_to_general_policies(self) -> None:
        cases = [
            (
                ("global-web", "🌏 国外网站", "IP-CIDR,18.194.0.0/15,no-resolve"),
                "18.194.1.1",
            ),
            (
                ("global-web", "🌏 国外网站", "IP-CIDR,34.224.0.0/12,no-resolve"),
                "34.224.1.1",
            ),
            (
                ("global-web", "🌏 国外网站", "IP-CIDR,54.242.0.0/15,no-resolve"),
                "54.242.1.1",
            ),
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
                ("media-taiwan", "🎬 台湾媒体", "DOMAIN-SUFFIX,friday.tw"),
                "video.friday.tw",
            ),
            (
                ("media-taiwan", "🎬 台湾媒体", "DOMAIN,theater-kktv.cdn.hinet.net"),
                "theater-kktv.cdn.hinet.net",
            ),
            (
                ("google", "🔎 Google", "DOMAIN-SUFFIX,redirector.gvt1.com"),
                "redirector.gvt1.com",
            ),
            (
                ("netflix", "🎬 Netflix", "DOMAIN-SUFFIX,netflix.com"),
                "www.netflix.com",
            ),
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
        include_external_controller: bool = True,
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
        if include_external_controller:
            profile["external-controller"] = "127.0.0.1:9090"
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
                rules=["DOMAIN,example.org,DIRECT", "MATCH,🐟 漏网之鱼"],
                include_external_controller=False,
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
