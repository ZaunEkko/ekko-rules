import assert from "node:assert/strict";
import test from "node:test";
import { buildShadowrocketConfig } from "./shadowrocket";

const SKELETON = `[General]
bypass-tun = 10.0.0.0/8

[Proxy]
DIRECT = direct
香港 01 = ss, 203.0.113.10, 443, encrypt-method=aes-256-gcm, password=test
Hysteria2 01 = hysteria2, 203.0.113.14, 443, password=hy-secret, sni=hy.example

[Proxy Group]
♻️ 手动切换 = select,DIRECT,香港 01
🛑 广告拦截 = select,REJECT,♻️ 手动切换,DIRECT,香港 01
🔞 NSFW = select,REJECT,♻️ 手动切换,DIRECT,香港 01
🧲 OpenAI = select,♻️ 手动切换,DIRECT,香港 01
🌏 国内网站 = select,DIRECT,♻️ 手动切换,香港 01

[Rule]
DOMAIN-SUFFIX,example.com,🧲 OpenAI
FINAL,♻️ 手动切换
`;

const NODES = `proxies:
  - {name: 香港 01, server: 203.0.113.10, port: 443, cipher: aes-256-gcm, password: test, type: ss}
  - {name: AnyTLS 01, server: 203.0.113.11, port: 443, password: any-secret, skip-cert-verify: true, sni: any.example, type: anytls, udp: true}
  - {name: TUIC 01, server: 203.0.113.12, port: 443, congestion-controller: bbr, password: tuic-secret, sni: tuic.example, skip-cert-verify: true, type: tuic, udp: true, udp-relay-mode: native, uuid: 00000000-0000-4000-8000-000000000003}
  - {name: Reality gRPC 01, server: 203.0.113.13, port: 443, client-fingerprint: chrome, flow: xtls-rprx-vision, grpc-opts: {grpc-service-name: tunnel}, network: grpc, reality-opts: {public-key: abcDEF0123, short-id: 0123456789abcdef}, servername: reality.example, tls: true, type: vless, uuid: 00000000-0000-4000-8000-000000000002}
  - {name: Hysteria2 01, server: 203.0.113.14, port: 443, password: hy-secret, sni: hy.example, skip-cert-verify: true, type: hysteria2, udp: true, obfs: salamander, obfs-password: obfs-secret, up: 100, down: 200}
`;

test("builds native Shadowrocket groups with stable special-policy defaults", () => {
  const output = buildShadowrocketConfig(SKELETON, NODES);

  assert.match(output, /^tun-excluded-routes = 10\.0\.0\.0\/8$/m);
  assert.doesNotMatch(output, /^DIRECT\s*=\s*direct$/m);
  assert.equal((output.match(/^香港 01 = ss,/gm) ?? []).length, 1);

  assert.match(
    output,
    /^♻️ 手动切换 = select,DIRECT,香港 01,AnyTLS 01,TUIC 01,Reality gRPC 01,Hysteria2 01,policy-select-name=DIRECT$/m,
  );
  assert.doesNotMatch(output, /^♻️ 手动切换 = .*\bhidden=/m);
  assert.match(
    output,
    /^🛑 广告拦截 = select,REJECT,♻️ 手动切换,DIRECT,香港 01,AnyTLS 01,TUIC 01,Reality gRPC 01,Hysteria2 01,policy-select-name=REJECT$/m,
  );
  assert.match(
    output,
    /^🔞 NSFW = select,REJECT,♻️ 手动切换,DIRECT,香港 01,AnyTLS 01,TUIC 01,Reality gRPC 01,Hysteria2 01,policy-select-name=REJECT$/m,
  );
  assert.match(
    output,
    /^🧲 OpenAI = select,♻️ 手动切换,DIRECT,香港 01,AnyTLS 01,TUIC 01,Reality gRPC 01,Hysteria2 01,policy-select-name=♻️ 手动切换$/m,
  );
  assert.match(
    output,
    /^🌏 国内网站 = select,DIRECT,♻️ 手动切换,香港 01,AnyTLS 01,TUIC 01,Reality gRPC 01,Hysteria2 01,policy-select-name=DIRECT$/m,
  );
  assert.match(output, /^DOMAIN-SUFFIX,example\.com,🧲 OpenAI$/m);
  assert.match(output, /\[Proxy Group\]\n\n♻️ 手动切换 = select,/);
});

test("restores modern nodes omitted by the Surge renderer", () => {
  const output = buildShadowrocketConfig(SKELETON, NODES);

  assert.match(
    output,
    /^AnyTLS 01 = anytls, 203\.0\.113\.11, 443, password=any-secret, udp=1, peer=any\.example, allowInsecure=1$/m,
  );
  assert.match(
    output,
    /^TUIC 01 = tuic, 203\.0\.113\.12, 443, password=tuic-secret, user=00000000-0000-4000-8000-000000000003, udp=1, congestion-controller=bbr, udp-relay-mode=native, peer=tuic\.example, allowInsecure=1$/m,
  );
  assert.match(
    output,
    /^Reality gRPC 01 = vless, 203\.0\.113\.13, 443, password=00000000-0000-4000-8000-000000000002, flow=xtls-rprx-vision, tls=true, peer=reality\.example, fp=chrome, security=reality, pbk=abcDEF0123, sid=0123456789abcdef, obfs=grpc, path=tunnel$/m,
  );
  assert.match(
    output,
    /^Hysteria2 01 = hysteria2, 203\.0\.113\.14, 443, auth=hy-secret, udp=1, peer=hy\.example, allowInsecure=1, obfsParam=obfs-secret, upmbps=100, downmbps=200$/m,
  );
  assert.equal((output.match(/^Hysteria2 01 =/gm) ?? []).length, 1);
});

test("restores a manual selector that Surge collapsed into a direct proxy", () => {
  const collapsed = SKELETON
    .replace("DIRECT = direct", "DIRECT = direct\n♻️ 手动切换 = direct")
    .replace(/^♻️ 手动切换 = select,.*\n/m, "");
  const output = buildShadowrocketConfig(collapsed, NODES);

  assert.doesNotMatch(output, /^♻️ 手动切换\s*=\s*direct$/m);
  assert.match(
    output,
    /^\[Proxy Group\]\n\n♻️ 手动切换 = select,DIRECT,香港 01,AnyTLS 01,TUIC 01,Reality gRPC 01,Hysteria2 01,policy-select-name=DIRECT$/m,
  );
  assert.match(
    output,
    /^🛑 广告拦截 = select,REJECT,♻️ 手动切换,DIRECT,/m,
  );
});

test("reports and removes an omitted unsupported node without failing the config", () => {
  const unknown = `proxies:
  - {name: Future 01, server: 203.0.113.50, port: 443, type: future-protocol}
`;
  const output = buildShadowrocketConfig(SKELETON, unknown);
  assert.match(
    output,
    /^# WARNING: skipped proxy "Future 01" \(future-protocol\): .*unsupported proxy type future-protocol\.$/m,
  );
  assert.match(output, /^香港 01 = ss,/m);
  assert.doesNotMatch(output, /^Future 01 =/m);
});

test("rejects delimiters that would corrupt native policy membership", () => {
  const unsafe = `proxies:
  - {name: "AnyTLS,unsafe", server: 203.0.113.11, port: 443, password: test, type: anytls}
`;
  assert.throws(
    () => buildShadowrocketConfig(SKELETON, unsafe),
    /node name contains an unsupported delimiter/,
  );
});

test("recognizes a hash inside an existing native proxy name", () => {
  const skeleton = SKELETON.replaceAll("香港 01", "HK#01");
  const nodes = NODES.replaceAll("香港 01", "HK#01");
  const output = buildShadowrocketConfig(skeleton, nodes);

  assert.match(output, /^HK#01 = ss,/m);
  assert.match(output, /^♻️ 手动切换 = select,DIRECT,HK#01,/m);
  assert.doesNotMatch(output, /skipped proxy "HK#01"/);
});

test("skips an incomplete TUIC v4 node and removes its group references", () => {
  const skeleton = SKELETON.replace(
    /^(.*= select,.*)$/gm,
    "$1,TUIC v4",
  );
  const nodes = `proxies:
  - {name: TUIC v4, server: 203.0.113.60, port: 443, token: old-token, type: tuic}
`;
  const output = buildShadowrocketConfig(skeleton, nodes);

  assert.match(
    output,
    /^# WARNING: skipped proxy "TUIC v4" \(tuic\): .*missing password\.$/m,
  );
  assert.doesNotMatch(output, /^TUIC v4 =/m);
  assert.doesNotMatch(output, /^.*= select,.*TUIC v4.*$/m);
  assert.match(output, /^🔞 NSFW = select,REJECT,♻️ 手动切换,DIRECT,/m);
});
