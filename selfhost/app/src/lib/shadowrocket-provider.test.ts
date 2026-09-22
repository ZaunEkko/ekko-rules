import assert from "node:assert/strict";
import test from "node:test";
import {
  externalizeShadowrocketProvider,
  shadowrocketProviderAddress,
  visibleSubscriptionOrigin,
} from "./shadowrocket-provider";

test("keeps inline nodes and points the named provider at the same subscription", () => {
  const source = `proxies:
  - name: "香港-01"
    type: ss
  - name: 美国-01
    type: anytls
proxy-groups:
  - name: 手动切换
    type: select
    proxies:
      - DIRECT
      - 香港-01
      - 美国-01
  - name: 广告拦截
    type: select
    proxies:
      - REJECT
      - 手动切换
rules:
  - MATCH,手动切换
`;
  const result = externalizeShadowrocketProvider(source, {
    name: "laomao",
    url: "https://sub.example/i/laomao.yaml?srhome=1&p=abc",
    intervalHours: 24,
  });
  assert.match(result, /^proxy-providers:\n  "laomao":/m);
  assert.match(result, /url: "https:\/\/sub\.example\/i\/laomao\.yaml\?srhome=1&p=abc"/);
  assert.match(result, /^proxies:$/m);
  assert.match(result, /^  - name: "香港-01"$/m);
  assert.match(result, /^  - name: 美国-01$/m);
  assert.ok(result.indexOf("proxies:") < result.indexOf("proxy-providers:"));
  assert.doesNotMatch(result, /^      - (?:香港-01|美国-01)$/m);
  assert.match(result, /- DIRECT\n    use:\n      - "laomao"/);
  assert.match(result, /- REJECT\n      - 手动切换/);
  assert.match(result, /^rules:$/m);
});

test("uses the configured origin or the device-visible host", () => {
  const request = new Request("http://0.0.0.0:3000/i/name.yaml", {
    headers: { host: "192.168.6.224:8787" },
  });
  assert.equal(visibleSubscriptionOrigin(request, "", false), "http://192.168.6.224:8787");
  assert.equal(
    visibleSubscriptionOrigin(request, "https://sub.example.test", false),
    "https://sub.example.test",
  );
  const proxied = new Request("http://0.0.0.0:3000/i/name.yaml", {
    headers: {
      host: "web:3000",
      "x-forwarded-host": "sub.example.test",
      "x-forwarded-proto": "https",
    },
  });
  assert.equal(visibleSubscriptionOrigin(proxied, "", true), "https://sub.example.test");
});

test("turns include-all groups into provider-backed groups", () => {
  const source = `proxies:\n  - {name: node, type: ss}\nproxy-groups:\n  - name: all\n    type: select\n    include-all: true\nrules:\n  - MATCH,all\n`;
  const result = externalizeShadowrocketProvider(source, {
    name: "机场",
    url: "https://example.test/nodes",
    intervalHours: 0,
  });
  assert.doesNotMatch(result, /include-all/);
  assert.match(result, /use:\n      - "机场"/);
  assert.match(result, /interval: 3600/);
});

test("uses the scanned address itself as the provider identity", () => {
  assert.equal(
    shadowrocketProviderAddress(
      "http://web:3000/i/laomao.yaml?srhome=1&p=abc&remark=laomao",
      "https://sub.example.test",
    ),
    "https://sub.example.test/i/laomao.yaml?srhome=1&p=abc&remark=laomao",
  );
});
