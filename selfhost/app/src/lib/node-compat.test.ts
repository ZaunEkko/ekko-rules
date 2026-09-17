import assert from "node:assert/strict";
import test from "node:test";
import {
  quoteCredentialsForClient,
  repairNodesForEngine,
} from "./node-compat";

const FLOW = `proxies:
  - {name: tj-1, server: a.example, port: 443, type: trojan, password: x}
  - { name: hy-1, server: b.example, port: 39121, sni: b.example, up: "50", down: "200", skip-cert-verify: false, ports: 39101-39199, type: hysteria2, password: y}
proxy-groups:
  - {name: PROXY, type: select, proxies: [tj-1, hy-1]}
`;

test("removes only the Hysteria2 extras the engine rejects", () => {
  const cleaned = repairNodesForEngine(FLOW);
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
  const cleaned = repairNodesForEngine(FLOW);
  assert.ok(
    cleaned.includes(
      "- {name: tj-1, server: a.example, port: 443, type: trojan, password: x}",
    ),
  );
});

test("does not touch a proxy-groups entry that happens to share a key", () => {
  const cleaned = repairNodesForEngine(FLOW);
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
  const cleaned = repairNodesForEngine(block);
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
  const cleaned = repairNodesForEngine(mixed);
  assert.ok(cleaned.includes('type: trojan, password: x, up: "1"'));
  assert.ok(cleaned.includes("type: hysteria2, password: y}"));
});

test("returns a document with no Hysteria2 unchanged", () => {
  const plain = "proxies:\n  - {name: a, type: ss, server: s, port: 1}\n";
  assert.equal(repairNodesForEngine(plain), plain);
});

test("leaves a base64 subscription untouched", () => {
  const encoded = Buffer.from("ss://abc@example.com:443#a\n").toString("base64");
  assert.equal(repairNodesForEngine(encoded), encoded);
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
  const cleaned = repairNodesForEngine(withAlpn);
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
  assert.ok(!repairNodesForEngine(quoted).includes("ports:"));
});

test("quotes a credential that YAML would read as a number", () => {
  const ambiguous = `proxies:
  - {name: r1, type: vless, server: a.example, port: 443, uuid: 00000000-0000-4000-8000-000000000001, reality-opts: {public-key: abc, short-id: 00112233}}
  - {name: t1, type: trojan, server: b.example, port: 443, password: 0123}
  - {name: h1, type: hysteria2, server: c.example, port: 443, password: 1e5}
`;
  const repaired = repairNodesForEngine(ambiguous);
  assert.ok(repaired.includes('short-id: "00112233"'));
  assert.ok(repaired.includes('password: "0123"'));
  assert.ok(repaired.includes('password: "1e5"'));
});

test("leaves an unambiguous credential exactly as written", () => {
  const plain = `proxies:
  - {name: r1, type: vless, server: a.example, port: 443, reality-opts: {short-id: a1b2c3d4}}
  - {name: t1, type: trojan, server: b.example, port: 443, password: s3cret-pass}
  - {name: t2, type: trojan, server: c.example, port: 443, password: "00112233"}
`;
  const repaired = repairNodesForEngine(plain);
  assert.ok(repaired.includes("short-id: a1b2c3d4"));
  assert.ok(repaired.includes("password: s3cret-pass"));
  assert.ok(repaired.includes('password: "00112233"'));
  assert.ok(!repaired.includes('""'));
});

test("quotes a block-style credential too", () => {
  const block = `proxies:
  - name: t1
    type: trojan
    server: b.example
    port: 443
    password: 00112233
`;
  const repaired = repairNodesForEngine(block);
  assert.ok(repaired.includes('password: "00112233"'));
});

test("does not quote a port or any other number that really is one", () => {
  const repaired = repairNodesForEngine(
    "proxies:\n  - {name: a, type: ss, server: s.example, port: 8388, password: 0123}\n",
  );
  assert.ok(repaired.includes("port: 8388"));
  assert.ok(repaired.includes('password: "0123"'));
});

test("returns a line with nothing to repair byte for byte", () => {
  // Rejoining a flow mapping normalises whitespace; a line that needs no
  // change must not be reformatted, least of all one holding a credential
  // with a quote and a comma in it.
  const tricky =
    'proxies:\n  - {name: t,type: trojan,  server: a.example, port: 443, password: "abc\\",def"}\n';
  assert.equal(repairNodesForEngine(tricky), tricky);
});

test("quotes a credential that carries a trailing comment", () => {
  const commented = `proxies:
  - name: t1
    type: trojan
    server: b.example
    port: 443
    password: 0123 # provider credential
`;
  const repaired = repairNodesForEngine(commented);
  assert.ok(repaired.includes('password: "0123" # provider credential'));
});

test("quotes what the engine hands back, without dropping anything", () => {
  // The engine writes credentials out unquoted again. Left alone, the client's
  // own YAML parser is the one that destroys them.
  const engineOutput = `proxies:
  - {name: r1, type: vless, server: a.example, port: 443, reality-opts: {short-id: 826209375e63}}
  - {name: h1, type: hysteria2, server: c.example, port: 443, password: y, ports: 1000-2000, up: "50"}
proxy-groups:
  - {name: PROXY, type: select, proxies: [r1, h1]}
`;
  const out = quoteCredentialsForClient(engineOutput);
  assert.ok(out.includes('short-id: "826209375e63"'));
  // The way out keeps every field it was given: this pass only adds quotes.
  assert.ok(out.includes("ports: 1000-2000"));
  assert.ok(out.includes('up: "50"'));
  assert.ok(out.includes("name: h1"));
});
