"""Validate both Shadowrocket scanner payload contracts as parsed YAML.

Home scanning receives one self-contained document with inline nodes. Config
scanning receives a provider-backed document plus its terminating node list.
This checks HTTP payloads, not Shadowrocket's private importer UI.
"""

import json
import sys
from pathlib import Path
from urllib.parse import urldefrag

import yaml


def check_nodes(proxies):
    assert isinstance(proxies, list) and proxies, "Node list is empty"
    node_names = [node["name"] for node in proxies]
    assert len(set(node_names)) == len(node_names), "Provider has duplicate node names"
    assert {"anytls", "hysteria2", "tuic", "vless"} <= {node["type"] for node in proxies}, "Modern fixture protocols were lost"
    for node in proxies:
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
    for policy in ("🛑 广告拦截", "🔞 NSFW"):
        assert by_name[policy]["proxies"][0] == "REJECT", "Blocking default was lost"
    assert len(config["rules"]) > 100, "Full rule set was lost"
    return groups, provider_users


def check_home(config):
    assert isinstance(config, dict), "Home config must be a YAML mapping"
    assert "proxy-providers" not in config, "Home config must not depend on a provider"
    node_names = check_nodes(config.get("proxies"))
    groups, provider_users = check_policies(config, node_names)
    assert provider_users == 0, "Home config unexpectedly uses a provider"
    manual = next(group for group in groups if group["name"] == "♻️ 手动切换")
    assert set(manual.get("proxies", [])) & set(node_names), "Manual selector has no inline nodes"
    return {"groups": len(groups), "rules": len(config["rules"]), "nodes": len(node_names)}


def check_provider_config(config, nodes, config_url, provider_url, name):
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
    node_names = check_nodes(nodes["proxies"])
    groups, provider_users = check_policies(config, (), providers)
    assert provider_users, "No group uses the named node source"
    manual = next(group for group in groups if group["name"] == "♻️ 手动切换")
    assert manual.get("use") == [name]
    return {"groups": len(groups), "rules": len(config["rules"]), "nodes": len(node_names)}


if __name__ == "__main__":
    mode = sys.argv[1]
    if mode == "home":
        config = yaml.safe_load(Path(sys.argv[2]).read_text(encoding="utf-8"))
        result = check_home(config)
    elif mode == "config":
        config_path, nodes_path, config_url, provider_url, name = sys.argv[2:]
        config = yaml.safe_load(Path(config_path).read_text(encoding="utf-8"))
        nodes = yaml.safe_load(Path(nodes_path).read_text(encoding="utf-8"))
        result = check_provider_config(config, nodes, config_url, provider_url, name)
    else:
        raise AssertionError(f"Unknown Shadowrocket check mode: {mode}")
    print(json.dumps(result))
