import assert from "node:assert/strict";
import test from "node:test";
import {
  findProxyProviderUrls,
  stripProxyProviders,
  MAX_PROXY_PROVIDERS,
} from "./proxy-providers";

const BLOCK_STYLE = `proxies:
  - {name: inline, type: ss, server: 203.0.113.9, port: 8388, cipher: aes-256-gcm, password: p}
proxy-providers:
  airport:
    type: http
    url: https://upstream.example/token/nodes.yaml
    interval: 3600
    path: ./providers/airport.yaml
  backup:
    type: http
    url: "https://backup.example/nodes.yaml"
    interval: 3600
proxy-groups:
  - {name: PROXY, type: select, use: [airport, backup]}
rules:
  - MATCH,PROXY
`;

test("reads provider urls in document order, without duplicates", () => {
  assert.deepEqual(findProxyProviderUrls(BLOCK_STYLE), [
    "https://upstream.example/token/nodes.yaml",
    "https://backup.example/nodes.yaml",
  ]);
});

test("reads a url written inline in a flow mapping", () => {
  const flow = `proxy-providers:
  airport: {type: http, url: 'https://flow.example/nodes.yaml', interval: 3600}
`;
  assert.deepEqual(findProxyProviderUrls(flow), [
    "https://flow.example/nodes.yaml",
  ]);
});

test("ignores the health-check probe next to a provider url", () => {
  const withProbe = `proxy-providers:
  airport:
    type: http
    url: https://upstream.example/nodes.yaml
    interval: 3600
    health-check:
      enable: true
      url: http://www.gstatic.com/generate_204
      interval: 300
  backup:
    type: http
    url: https://backup.example/nodes.yaml
    health-check: {enable: true, url: http://www.gstatic.com/generate_204}
`;
  assert.deepEqual(findProxyProviderUrls(withProbe), [
    "https://upstream.example/nodes.yaml",
    "https://backup.example/nodes.yaml",
  ]);
});

test("ignores a probe nested inside an inline provider definition", () => {
  const inline = `proxy-providers:
  airport: {type: http, url: https://upstream.example/nodes.yaml, health-check: {enable: true, url: http://probe.example/204}}
`;
  assert.deepEqual(findProxyProviderUrls(inline), [
    "https://upstream.example/nodes.yaml",
  ]);
});

test("ignores a provider that names a path on someone else's machine", () => {
  const local = `proxy-providers:
  airport:
    type: file
    path: ./providers/airport.yaml
`;
  assert.deepEqual(findProxyProviderUrls(local), []);
});

test("does not walk past the provider section", () => {
  const trailing = `proxy-providers:
  airport: {type: http, url: https://upstream.example/a.yaml}
rule-providers:
  ads: {type: http, url: https://rules.example/ads.yaml}
`;
  assert.deepEqual(findProxyProviderUrls(trailing), [
    "https://upstream.example/a.yaml",
  ]);
});

test("stops collecting rather than following an unbounded list", () => {
  const many =
    "proxy-providers:\n" +
    Array.from(
      { length: MAX_PROXY_PROVIDERS + 4 },
      (_, index) =>
        `  p${index}: {type: http, url: https://upstream.example/${index}.yaml}`,
    ).join("\n");
  assert.equal(findProxyProviderUrls(many).length, MAX_PROXY_PROVIDERS);
});

test("spends the whole budget on node urls, not on probes", () => {
  // Every provider shares one health-check endpoint. Counting it would cost a
  // slot and silently drop the last provider's nodes.
  const withProbes =
    "proxy-providers:\n" +
    Array.from({ length: MAX_PROXY_PROVIDERS }, (_, index) =>
      [
        `  p${index}:`,
        "    type: http",
        `    url: https://upstream.example/${index}.yaml`,
        "    health-check:",
        "      enable: true",
        "      url: http://www.gstatic.com/generate_204",
      ].join("\n"),
    ).join("\n");
  const found = findProxyProviderUrls(withProbes);
  assert.equal(found.length, MAX_PROXY_PROVIDERS);
  assert.ok(found.every((url) => url.startsWith("https://upstream.example/")));
});

test("reads a section header that carries a comment", () => {
  const annotated = `proxy-providers: # downloaded hourly
  airport: {type: http, url: https://upstream.example/nodes.yaml}
`;
  assert.deepEqual(findProxyProviderUrls(annotated), [
    "https://upstream.example/nodes.yaml",
  ]);
  assert.equal(stripProxyProviders(annotated).includes("proxy-providers"), false);
});

test("ends an unquoted url where its comment begins", () => {
  const commented = `proxy-providers:
  airport:
    type: http
    url: https://upstream.example/nodes.yaml # downloaded hourly
`;
  assert.deepEqual(findProxyProviderUrls(commented), [
    "https://upstream.example/nodes.yaml",
  ]);
});

test("reads a section written as one flow mapping", () => {
  const flowSection = `proxy-providers: {airport: {type: http, url: https://upstream.example/nodes.yaml, health-check: {enable: true, url: http://probe.example/204}}, backup: {type: http, url: https://backup.example/nodes.yaml}}
rules:
  - MATCH,DIRECT
`;
  assert.deepEqual(findProxyProviderUrls(flowSection), [
    "https://upstream.example/nodes.yaml",
    "https://backup.example/nodes.yaml",
  ]);
  const stripped = stripProxyProviders(flowSection);
  assert.ok(!stripped.includes("proxy-providers"));
  assert.ok(stripped.includes("rules:"));
});

test("ignores a provider url that was commented out", () => {
  const commentedOut = `proxy-providers:
  airport:
    # url: https://old.example/nodes.yaml
    type: http
    url: https://new.example/nodes.yaml
`;
  assert.deepEqual(findProxyProviderUrls(commentedOut), [
    "https://new.example/nodes.yaml",
  ]);
});

test("finds nothing in a document that has no providers", () => {
  assert.deepEqual(findProxyProviderUrls("proxies:\n  - {name: a}\n"), []);
  assert.deepEqual(findProxyProviderUrls(""), []);
});

test("strips the provider section and keeps everything else", () => {
  const stripped = stripProxyProviders(BLOCK_STYLE);
  assert.ok(!stripped.includes("proxy-providers:"));
  assert.ok(!stripped.includes("upstream.example"));
  assert.ok(stripped.includes("proxies:"));
  assert.ok(stripped.includes("name: inline"));
  assert.ok(stripped.includes("proxy-groups:"));
  assert.ok(stripped.includes("rules:"));
});

test("leaves a document without providers untouched", () => {
  const plain = "proxies:\n  - {name: a}\n";
  assert.equal(stripProxyProviders(plain), plain);
});

test("returns nothing when the providers were the whole document", () => {
  assert.equal(
    stripProxyProviders(
      "proxy-providers:\n  airport: {type: http, url: https://a.example/n.yaml}\n",
    ),
    "",
  );
});
