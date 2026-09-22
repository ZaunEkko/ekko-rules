"""Validate fetched Shadowrocket config/provider documents, not just markers.

This checks the HTTP payload contract, not Shadowrocket's private importer UI.
The E2E driver fetches both documents before invoking this checker.
"""

import json
import sys
from pathlib import Path
from urllib.parse import urldefrag

import yaml


def check(config, nodes, config_url, provider_url, name):
    assert isinstance(config, dict), "Config must be a YAML mapping"
    providers = config.get("proxy-providers", {})
    assert list(providers) == [name], "Config must have exactly one named node source"
    provider = providers[name]
    assert provider["type"] == "http", "Node source must be remotely refreshable"
    assert provider["url"] == provider_url, "Fetched provider must match its declaration"
    assert urldefrag(config_url)[0] != urldefrag(provider_url)[0], "Provider refers back to the config"
    assert not urldefrag(provider_url)[1], "Fragments must not create duplicate subscription identities"
    assert config.get("proxies") == [], "Config must have an explicit empty local node list"
    assert isinstance(nodes, dict) and set(nodes) == {"proxies"}, "Provider must terminate at nodes, with no config or child providers"
    assert isinstance(nodes["proxies"], list) and nodes["proxies"], "Provider has no nodes"
    node_names = [node["name"] for node in nodes["proxies"]]
    assert len(set(node_names)) == len(node_names), "Provider has duplicate node names"
    assert {"anytls", "hysteria2", "tuic", "vless"} <= {node["type"] for node in nodes["proxies"]}, "Modern fixture protocols were lost"
    for node in nodes["proxies"]:
        assert node.get("server") and node.get("port"), "Node lacks its endpoint"

    groups = config["proxy-groups"]
    group_names = {group["name"] for group in groups}
    assert len(group_names) == len(groups), "Duplicate policy group"
    provider_users = 0
    for group in groups:
        uses = group.get("use", [])
        assert set(uses) <= set(providers), "Group refers to an unknown provider"
        provider_users += len(uses)
        for member in group.get("proxies", []):
            assert member in group_names | {"DIRECT", "REJECT", "REJECT-DROP", "PASS", "COMPATIBLE"}, "Group refers to an absent local node"
    assert provider_users, "No group uses the named node source"
    by_name = {group["name"]: group for group in groups}
    assert by_name["♻️ 手动切换"]["type"] == "select"
    assert by_name["♻️ 手动切换"].get("use") == [name]
    assert not by_name["♻️ 手动切换"].get("hidden", False)
    for policy in ("🛑 广告拦截", "🔞 NSFW"):
        assert by_name[policy]["proxies"][0] == "REJECT", "Blocking default was lost"
    assert len(config["rules"]) > 100, "Full rule set was lost"
    return {"groups": len(groups), "rules": len(config["rules"]), "nodes": len(node_names)}


if __name__ == "__main__":
    config_path, nodes_path, config_url, provider_url, name = sys.argv[1:]
    config = yaml.safe_load(Path(config_path).read_text(encoding="utf-8"))
    nodes = yaml.safe_load(Path(nodes_path).read_text(encoding="utf-8"))
    print(json.dumps(check(config, nodes, config_url, provider_url, name)))
