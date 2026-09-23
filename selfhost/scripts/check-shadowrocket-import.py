"""Validate the node subscription consumed by Shadowrocket's Home screen."""

import json
import sys
from pathlib import Path
import yaml


def check_nodes(proxies):
    assert isinstance(proxies, list) and proxies, "Node list is empty"
    node_names = [node["name"] for node in proxies]
    assert len(set(node_names)) == len(node_names), "Config has duplicate proxy names"
    service_nodes = [node for node in proxies if node["type"] not in {"direct", "reject"}]
    assert {"anytls", "hysteria2", "tuic", "vless"} <= {node["type"] for node in service_nodes}, "Modern fixture protocols were lost"
    for node in service_nodes:
        assert node.get("server") and node.get("port"), "Node lacks its endpoint"
    return node_names


def check_home(config):
    assert isinstance(config, dict), "Scanner config must be a YAML mapping"
    assert "proxy-providers" not in config, "Scanner config must not depend on a provider"
    node_names = check_nodes(config.get("proxies"))
    return {"nodes": len(node_names)}


if __name__ == "__main__":
    mode = sys.argv[1]
    if mode == "home":
        config = yaml.safe_load(Path(sys.argv[2]).read_text(encoding="utf-8"))
        result = check_home(config)
    else:
        raise AssertionError(f"Unknown Shadowrocket check mode: {mode}")
    print(json.dumps(result))
