from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path

from profile_model import (
    ProfileError,
    compare_trees,
    load_profile_sources,
    parse_json_document,
    render_profile,
)


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SOURCES = PROJECT_ROOT / "sources"
DEFAULT_OUTPUT = PROJECT_ROOT / "generated" / "reversed-profile"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate Ekko Rules products from canonical in-repository sources."
    )
    parser.add_argument(
        "--sources",
        type=Path,
        default=DEFAULT_SOURCES,
        help=f"Canonical source directory (default: {DEFAULT_SOURCES})",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help=f"Generated product directory (default: {DEFAULT_OUTPUT})",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Compare a clean render with the current output without modifying it.",
    )
    return parser.parse_args()


def require_owned_output(path: Path) -> None:
    require_directory(path)
    manifest_path = path / "manifest.json"
    try:
        manifest = parse_json_document(
            manifest_path.read_text(encoding="utf-8"), context=str(manifest_path)
        )
    except (OSError, UnicodeError, ProfileError) as exc:
        raise ProfileError(
            f"Refusing to replace an unrecognized existing directory: {path}"
        ) from exc
    if not (
        isinstance(manifest, dict)
        and manifest.get("schema_version") == 1
        and manifest.get("profile") == "reversed-profile"
        and manifest.get("hash_algorithm") == "sha256"
        and manifest.get("self") == "manifest.json"
        and manifest.get("self_hash_included") is False
        and isinstance(manifest.get("files"), dict)
    ):
        raise ProfileError(
            f"Refusing to replace an unrecognized existing directory: {path}"
        )
    hashes = manifest["files"]
    if not hashes or not all(
        isinstance(relative, str)
        and isinstance(expected_hash, str)
        and len(expected_hash) == 64
        for relative, expected_hash in hashes.items()
    ):
        raise ProfileError(f"Refusing to replace an invalid output directory: {path}")
    required_markers = {
        "config/ekko-rules.ini",
        "Mihomo/reversed-template.yaml",
        "analysis.json",
    }
    if not required_markers <= set(hashes):
        raise ProfileError(f"Refusing to replace an unrecognized output directory: {path}")


def replace_directory(staging: Path, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    backup = output.parent / f".{output.name}.backup"
    if backup.exists():
        raise ProfileError(
            f"Refusing to replace output while a recovery directory exists: {backup}"
        )

    moved_old_output = False
    try:
        if output.exists():
            require_owned_output(output)
            os.replace(output, backup)
            moved_old_output = True
        os.replace(staging, output)
    except BaseException:
        if moved_old_output and not output.exists() and backup.exists():
            os.replace(backup, output)
        raise
    else:
        if backup.exists():
            shutil.rmtree(backup)


def require_directory(path: Path) -> None:
    if not path.is_dir():
        raise ProfileError(f"Expected a directory: {path}")


def main() -> int:
    args = parse_args()
    sources_path = args.sources.resolve()
    output_path = args.output.resolve()
    if (
        output_path == sources_path
        or output_path.is_relative_to(sources_path)
        or sources_path.is_relative_to(output_path)
    ):
        raise ProfileError(
            "Generated output and canonical sources must not contain each other"
        )

    sources = load_profile_sources(sources_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_root = Path(
        tempfile.mkdtemp(prefix=f".{output_path.name}.stage-", dir=output_path.parent)
    )
    staging = temporary_root / output_path.name
    try:
        render_profile(sources, staging)
        if args.check:
            diff = compare_trees(staging, output_path)
            result = {
                "status": "passed" if diff.clean else "out-of-date",
                "mode": "check",
                "output": str(output_path),
                **diff.as_dict(),
            }
            print(json.dumps(result, ensure_ascii=False, indent=2))
            return 0 if diff.clean else 1

        diff = compare_trees(staging, output_path)
        replace_directory(staging, output_path)
        print(
            json.dumps(
                {
                    "status": "generated",
                    "output": str(output_path),
                    "products": {
                        product: {
                            "segments": len(sources.segments_for(product)),
                            "rule_files": len(sources.rule_segments_for(product)),
                            "proxy_groups": len(sources.proxy_groups_for(product)),
                        }
                        for product in ("core", "extended")
                    },
                    "previous_output_was_current": diff.clean,
                    "previous_difference": diff.as_dict(),
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return 0
    finally:
        if temporary_root.exists():
            shutil.rmtree(temporary_root)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ProfileError as exc:
        print(f"generation failed: {exc}", file=sys.stderr)
        raise SystemExit(2) from exc
