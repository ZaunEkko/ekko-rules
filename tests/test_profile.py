from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = ROOT / "scripts"
SOURCES = ROOT / "sources"
GENERATED = ROOT / "generated" / "reversed-profile"
sys.path.insert(0, str(ROOT))

from scripts.profile_model import (  # noqa: E402
    ProfileError,
    compare_trees,
    coverage_metrics,
    first_match,
    load_profile_sources,
    render_profile,
)


class CanonicalSourceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.sources = load_profile_sources(SOURCES)

    def test_shape_and_order_snapshot(self) -> None:
        self.assertEqual(len(self.sources.segments), 43)
        self.assertEqual(len(self.sources.rule_segments), 42)
        self.assertEqual(len(self.sources.proxy_groups), 42)
        self.assertEqual(self.sources.terminal.slug, "final")
        self.assertEqual(self.sources.terminal.target, "🐟 漏网之鱼")
        self.assertEqual(
            [
                segment.slug
                for segment in self.sources.segments
                if segment.target == "🎵 音乐平台"
            ],
            ["music", "music-2"],
        )

    def test_no_resolve_and_strict_cidr_gate(self) -> None:
        self.assertEqual(
            self.sources.quality_baseline["scope"][
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
        baseline = self.sources.quality_baseline["first_match_unreachable"]
        current = coverage_metrics(self.sources)
        self.assertEqual(
            current,
            {
                key: baseline[key]
                for key in ("global", "within_same_segment", "cross_segment_only")
            },
        )
        previous = baseline["previous_bootstrap"]
        self.assertLess(current["global"]["union"], previous["global_union"])
        self.assertLess(
            current["within_same_segment"]["union"],
            previous["within_same_segment_union"],
        )
        self.assertLess(
            current["cross_segment_only"]["union"],
            previous["cross_segment_only_union"],
        )

    def test_sensitive_or_nonportable_source_fields_are_rejected(self) -> None:
        mutations = [
            ("manifest.yaml", "https://raw.githubusercontent.com/", "https://user:secret@raw.githubusercontent.com/"),
            ("manifest.yaml", "/Ruleset", "/Ruleset?X-Amz-Signature=secret"),
            ("proxy-groups.yaml", "path: ./proxy_provider/subscription.yaml", "path: /home/alice/private-subscription.yaml"),
            ("proxy-groups.yaml", "https://www.gstatic.com/generate_204", "https://example.com/check?X-Amz-Signature=secret"),
            ("base.yaml", "mixed-port: 7890", "mixed-port: true"),
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
            analysis = json.loads(analysis_path.read_text(encoding="utf-8"))
            analysis["invariants"]["destination_ip_rule_count"] = 1
            analysis_path.write_text(
                json.dumps(analysis, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
                newline="\n",
            )
            self.update_manifest_hash(output, "analysis.json")
            completed = self.run_validator_without_generation_check(output)
            self.assertEqual(completed.returncode, 1)
            self.assertIn("analysis.json differs", completed.stderr)

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


if __name__ == "__main__":
    unittest.main()
