import assert from "node:assert/strict";
import test from "node:test";
import { parse } from "yaml";
import { preserveMihomoHosts } from "./mihomo-hosts";

const complete = `dns:
  enable: true
  listen: 127.0.0.1:1053
  enhanced-mode: fake-ip
  nameserver: [223.5.5.5]
  proxy-server-nameserver: [119.29.29.29]
  proxy-server-nameserver-policy:
    other.example: [9.9.9.9]
  fake-ip-filter: ['*.lan']
proxies:
  - {name: node, type: ss, server: entry.example, port: 443, password: 00123}
proxy-groups:
  - {name: Select, type: select, proxies: [node]}
rules:
  - MATCH,Select
`;

test("leaves subscriptions without hosts byte-for-byte unchanged", () => {
  for (const source of ["ss://example", "c3M6Ly9leGFtcGxl", "proxies: []\n", "hosts: {}\n", "hosts: null\n"]) {
    assert.equal(preserveMihomoHosts(complete, [source]), complete);
  }
});

test("preserves CNAME hosts, scopes node DNS to aliases and excludes their targets from fake-IP", () => {
  const source = `hosts:
  entry.example: relay.example
  relay.example: final.example
  '*.fixed.example': [192.0.2.1, '2001:db8::1']
`;
  const result = preserveMihomoHosts(complete, [source]);
  const config = parse(result);
  assert.deepEqual(config.hosts, parse(source).hosts);
  assert.deepEqual(config.dns["proxy-server-nameserver"], ["119.29.29.29"]);
  assert.deepEqual(config.dns["proxy-server-nameserver-policy"], {
    "other.example": ["9.9.9.9"],
    "entry.example": ["udp://127.0.0.1:1053"],
    "relay.example": ["udp://127.0.0.1:1053"],
  });
  assert.deepEqual(config.dns["fake-ip-filter"], ["*.lan", "relay.example", "final.example"]);
  assert.equal(config.dns["use-hosts"], true);
  assert.equal(result.slice(result.indexOf("proxies:"), result.search(/^hosts:/m)), complete.slice(complete.indexOf("proxies:")));
  assert.match(result, /password: 00123/);
});

test("IP-valued hosts do not change the template DNS", () => {
  const source = `hosts: {entry.example: 192.0.2.1, ipv6.example: '2001:db8::1'}\n`;
  const result = preserveMihomoHosts(complete, [source]);
  assert.deepEqual(parse(result).hosts, parse(source).hosts);
  assert.ok(result.startsWith(complete));
});

test("merges template, provider and subscription hosts without duplicate keys", () => {
  const body = `${complete}hosts: {template.example: 192.0.2.2, shared.example: 192.0.2.3}\n`;
  const result = preserveMihomoHosts(body, [
    '"hosts": {shared.example: 192.0.2.4}\n',
    "hosts: {provider.example: 192.0.2.5, shared.example: 192.0.2.6}\n",
  ]);
  assert.deepEqual(parse(result).hosts, {
    "template.example": "192.0.2.2",
    "provider.example": "192.0.2.5",
    "shared.example": "192.0.2.4",
  });
  assert.equal((result.match(/^hosts:/gm) ?? []).length, 1);
});

test("uses the generated listener rather than copying a provider's local port", () => {
  const source = `dns:
  listen: 0.0.0.0:9876
  proxy-server-nameserver: [udp://127.0.0.1:9876]
hosts: {entry.example: relay.example}
`;
  const config = parse(preserveMihomoHosts(complete, [source]));
  assert.equal(config.dns.listen, "127.0.0.1:1053");
  assert.deepEqual(config.dns["proxy-server-nameserver-policy"]["entry.example"], ["udp://127.0.0.1:1053"]);
});

test("handles wildcard listeners and missing DNS sections", () => {
  const source = "hosts: {entry.example: relay.example}\n";
  const wildcard = parse(preserveMihomoHosts(complete.replace("127.0.0.1:1053", "0.0.0.0:1053"), [source]));
  assert.deepEqual(wildcard.dns["proxy-server-nameserver-policy"]["entry.example"], ["udp://127.0.0.1:1053"]);
  const absent = parse(preserveMihomoHosts("proxies: []\n", [source]));
  assert.equal(absent.dns.listen, "127.0.0.1:53");
  assert.equal(absent.dns.enable, true);
});

test("keeps alias destinations real with rule-based and whitelist fake-IP filters", () => {
  const source = "hosts: {entry.example: relay.example}\n";
  const rule = parse(preserveMihomoHosts(complete.replace("  fake-ip-filter: ['*.lan']", "  fake-ip-filter-mode: rule\n  fake-ip-filter: ['MATCH,fake-ip']"), [source]));
  assert.deepEqual(rule.dns["fake-ip-filter"], ["DOMAIN,relay.example,real-ip", "MATCH,fake-ip"]);
  const whitelist = parse(preserveMihomoHosts(complete.replace("  fake-ip-filter: ['*.lan']", "  fake-ip-filter-mode: whitelist\n  fake-ip-filter: ['+.example', '*.lan', 'geosite:cn', 'rule-set:private']"), [source]));
  assert.equal(whitelist.dns["fake-ip-filter-mode"], "rule");
  assert.deepEqual(whitelist.dns["fake-ip-filter"], [
    "DOMAIN,relay.example,real-ip", "DOMAIN-SUFFIX,example,fake-ip",
    "DOMAIN-WILDCARD,*.lan,fake-ip", "GEOSITE,cn,fake-ip",
    "RULE-SET,private,fake-ip", "MATCH,real-ip",
  ]);
});

test("never leaks subscription text in a YAML error", () => {
  assert.throws(
    () => preserveMihomoHosts(complete, ["hosts: {broken\npassword: private-value\n"]),
    error => error instanceof Error && !error.message.includes("private-value"),
  );
});

test("reads anchored, quoted, flow-style and BOM-prefixed hosts", () => {
  const source = "\uFEFFknown: &address 192.0.2.7\n'hosts': {entry.example: *address}\n";
  assert.equal(parse(preserveMihomoHosts(complete, [source])).hosts["entry.example"], "192.0.2.7");
  assert.equal(parse(preserveMihomoHosts(complete, ["\uFEFFhosts: {entry.example: 192.0.2.8}\n"])).hosts["entry.example"], "192.0.2.8");
});

test("uses one local resolver when every node needs an alias and the template has no custom policy", () => {
  const body = complete.replace("  proxy-server-nameserver-policy:\n    other.example: [9.9.9.9]\n", "");
  const result = parse(preserveMihomoHosts(body, ["hosts: {entry.example: relay.example}\n"]));
  assert.deepEqual(result.dns["proxy-server-nameserver"], ["udp://127.0.0.1:1053"]);
  assert.equal(result.dns["proxy-server-nameserver-policy"], undefined);
  assert.ok(result.dns["fake-ip-filter"].includes("relay.example"));
});

test("keeps the existing resolver for unrelated nodes in a mixed subscription", () => {
  const body = complete
    .replace("  proxy-server-nameserver-policy:\n    other.example: [9.9.9.9]\n", "")
    .replace("proxy-groups:", "  - {name: other, type: ss, server: unrelated.example, port: 443, password: example}\nproxy-groups:");
  const result = parse(preserveMihomoHosts(body, ["hosts: {entry.example: relay.example}\n"]));
  assert.deepEqual(result.dns["proxy-server-nameserver"], ["119.29.29.29"]);
  assert.deepEqual(result.dns["proxy-server-nameserver-policy"], {"entry.example": ["udp://127.0.0.1:1053"]});
});
