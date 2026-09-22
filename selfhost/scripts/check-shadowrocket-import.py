"""Validate either Shadowrocket scanner's complete YAML payload."""

import json
import sys
from pathlib import Path
import yaml


def check_nodes(proxies):
    assert isinstance(proxies, list) and proxies, "Node list is empty"
    node_names = [node["name"] for node in proxies]
    assert len(set(node_names)) == len(node_names), "Config has duplicate proxy names"
    assert {"🚀 DIRECT", "🛑 REJECT"} <= set(node_names), "Selectable direct/reject aliases are missing"
    service_nodes = [node for node in proxies if node["type"] not in {"direct", "reject"}]
    assert {"anytls", "hysteria2", "tuic", "vless"} <= {node["type"] for node in service_nodes}, "Modern fixture protocols were lost"
    for node in service_nodes:
        assert node.get("server") and node.get("port"), "Node lacks its endpoint"
    return node_names


def check_policies(config, node_names, providers=()):
    groups = config["proxy-groups"]
    group_names = {group["name"] for group in groups}
    assert len(group_names) == len(groups), "Duplicate policy group"
    provider_users = 0
    for group in groups:
        uses = group.get("use", [])
        assert set(uses) <= set(providers), "Group refers to an unknown provider"
        provider_users += len(uses)
        for member in group.get("proxies", []):
            assert member in group_names | set(node_names) | {"DIRECT", "REJECT", "REJECT-DROP", "PASS", "COMPATIBLE"}, "Group refers to an absent node"
    by_name = {group["name"]: group for group in groups}
    assert by_name["♻️ 手动切换"]["type"] == "select"
    assert not by_name["♻️ 手动切换"].get("hidden", False)
    assert by_name["♻️ 手动切换"]["proxies"][0] == "🚀 DIRECT", "Manual direct choice was lost"
    for policy in ("🛑 广告拦截", "🔞 NSFW"):
        assert by_name[policy]["proxies"][0] == "🛑 REJECT", "Blocking default was lost"
    assert len(config["rules"]) > 100, "Full rule set was lost"
    return groups, provider_users


def check_complete(config):
    assert isinstance(config, dict), "Scanner config must be a YAML mapping"
    assert "proxy-providers" not in config, "Scanner config must not depend on a provider"
    node_names = check_nodes(config.get("proxies"))
    groups, provider_users = check_policies(config, node_names)
    assert provider_users == 0, "Scanner config unexpectedly uses a provider"
    manual = next(group for group in groups if group["name"] == "♻️ 手动切换")
    assert set(manual.get("proxies", [])) & set(node_names), "Manual selector has no inline nodes"
    return {"groups": len(groups), "rules": len(config["rules"]), "nodes": len(node_names)}


if __name__ == "__main__":
    mode = sys.argv[1]
    if mode in {"home", "config"}:
        config = yaml.safe_load(Path(sys.argv[2]).read_text(encoding="utf-8"))
        result = check_complete(config)
    else:
        raise AssertionError(f"Unknown Shadowrocket check mode: {mode}")
    print(json.dumps(result))
