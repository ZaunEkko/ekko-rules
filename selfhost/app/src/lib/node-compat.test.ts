import assert from "node:assert/strict";
import test from "node:test";
import { dropUnsupportedNodeFields } from "./node-compat";

const FLOW = `proxies:
  - {name: tj-1, server: a.example, port: 443, type: trojan, password: x}
  - { name: hy-1, server: b.example, port: 39121, sni: b.example, up: "50", down: "200", skip-cert-verify: false, ports: 39101-39199, type: hysteria2, password: y}
proxy-groups:
  - {name: PROXY, type: select, proxies: [tj-1, hy-1]}
`;

test("removes only the Hysteria2 extras the engine rejects", () => {
  const cleaned = dropUnsupportedNodeFields(FLOW);
  assert.ok(!cleaned.includes("ports:"));
  assert.ok(!cleaned.includes("up:"));
  assert.ok(!cleaned.includes("down:"));
  // the node itself survives, with everything it needs to connect
  assert.ok(cleaned.includes("name: hy-1"));
  assert.ok(cleaned.includes("port: 39121"));
  assert.ok(cleaned.includes("password: y"));
  assert.ok(cleaned.includes("sni: b.example"));
  assert.ok(cleaned.includes("skip-cert-verify: false"));
});

test("leaves other node types alone", () => {
  const cleaned = dropUnsupportedNodeFields(FLOW);
  assert.ok(
    cleaned.includes(
      "- {name: tj-1, server: a.example, port: 443, type: trojan, password: x}",
    ),
  );
});

test("does not touch a proxy-groups entry that happens to share a key", () => {
  const cleaned = dropUnsupportedNodeFields(FLOW);
  assert.ok(cleaned.includes("proxies: [tj-1, hy-1]"));
});

test("handles block-style entries", () => {
  const block = `proxies:
  - name: hy-1
    type: hysteria2
    server: b.example
    port: 39121
    password: y
    ports: 39101-39199
    up: "50"
    down: "200"
  - name: tj-1
    type: trojan
    server: a.example
    port: 443
    password: x
`;
  const cleaned = dropUnsupportedNodeFields(block);
  assert.ok(!/^\s+ports:/m.test(cleaned));
  assert.ok(!/^\s+up:/m.test(cleaned));
  assert.ok(!/^\s+down:/m.test(cleaned));
  assert.ok(cleaned.includes("name: hy-1"));
  assert.ok(cleaned.includes("port: 39121"));
  assert.ok(cleaned.includes("name: tj-1"));
});

test("keeps an up: that belongs to some other node type", () => {
  // Only Hysteria2 entries are rewritten, so another type keeps its fields
  // even when one of them shares a name with the rejected keys.
  const mixed = `proxies:
  - {name: t, server: a.example, port: 443, type: trojan, password: x, up: "1"}
  - {name: h, server: b.example, port: 443, type: hysteria2, password: y, up: "2"}
`;
  const cleaned = dropUnsupportedNodeFields(mixed);
  assert.ok(cleaned.includes('type: trojan, password: x, up: "1"'));
  assert.ok(cleaned.includes("type: hysteria2, password: y}"));
});

test("returns a document with no Hysteria2 unchanged", () => {
  const plain = "proxies:\n  - {name: a, type: ss, server: s, port: 1}\n";
  assert.equal(dropUnsupportedNodeFields(plain), plain);
});

test("leaves a base64 subscription untouched", () => {
  const encoded = Buffer.from("ss://abc@example.com:443#a\n").toString("base64");
  assert.equal(dropUnsupportedNodeFields(encoded), encoded);
});

test("keeps a nested sequence with the node that owns it", () => {
  // `alpn:` + `- h3` is ordinary here. Reading `- h3` as a new entry would cut
  // the node in half and leave the fields below it in place.
  const withAlpn = `proxies:
  - name: hy-1
    type: hysteria2
    server: b.example
    port: 39121
    alpn:
      - h3
    ports: 39101-39199
    up: "50"
    down: "200"
    password: y
`;
  const cleaned = dropUnsupportedNodeFields(withAlpn);
  assert.ok(!/^\s+ports:/m.test(cleaned));
  assert.ok(!/^\s+up:/m.test(cleaned));
  assert.ok(!/^\s+down:/m.test(cleaned));
  assert.ok(cleaned.includes("- h3"));
  assert.ok(cleaned.includes("password: y"));
});

test("recognizes a quoted type value", () => {
  const quoted = `proxies:
  - {name: h, server: b.example, port: 443, type: "hysteria2", password: y, ports: 1-2}
`;
  assert.ok(!dropUnsupportedNodeFields(quoted).includes("ports:"));
});
