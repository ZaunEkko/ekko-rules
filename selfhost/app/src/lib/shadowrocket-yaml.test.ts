import assert from "node:assert/strict";
import test from "node:test";
import { materializeShadowrocketPolicyChoices } from "./shadowrocket-yaml";

const SOURCE = `proxies:
  - { name: "香港-01", type: ss, server: 127.0.0.1, port: 8388, cipher: aes-128-gcm, password: test }
proxy-groups:
  - name: ♻️ 手动切换
    type: select
    proxies:
      - DIRECT
      - 香港-01
  - name: 🛑 广告拦截
    type: select
    proxies:
      - REJECT
      - ♻️ 手动切换
      - DIRECT
  - name: 🔞 NSFW
    type: select
    proxies:
      - REJECT
      - ♻️ 手动切换
rules:
  - MATCH,DIRECT
`;

test("materializes selectable direct and reject aliases in a complete YAML config", () => {
  const output = materializeShadowrocketPolicyChoices(SOURCE);

  assert.match(output, /- \{ name: "🚀 DIRECT", type: direct \}/);
  assert.match(output, /- \{ name: "🛑 REJECT", type: reject \}/);
  assert.match(output, /- "🚀 DIRECT"\n      - 香港-01/);
  assert.match(output, /- "🛑 REJECT"\n      - ♻️ 手动切换\n      - "🚀 DIRECT"/);
  assert.match(output, /- "🛑 REJECT"\n      - ♻️ 手动切换\nrules:/);
  assert.match(output, /- MATCH,DIRECT/);
});

test("does not duplicate aliases when a Shadowrocket YAML refreshes", () => {
  const first = materializeShadowrocketPolicyChoices(SOURCE);
  const second = materializeShadowrocketPolicyChoices(first);

  assert.equal(second, first);
});
