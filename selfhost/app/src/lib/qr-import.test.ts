import assert from "node:assert/strict";
import test from "node:test";
import {
  clientInstallLabel,
  clientInstallQrHint,
  defaultQrImportMode,
  qrImportValue,
  supportsClientInstallQr,
} from "./qr-import";

const subscriptionUrl =
  "http://192.168.6.224:8787/sub/abc_123-example";

test("wraps Mihomo subscriptions in the Clash remote-install scheme", () => {
  assert.equal(supportsClientInstallQr("clash"), true);
  assert.equal(
    qrImportValue("clash", subscriptionUrl, "install"),
    "clash://install-config?url=http%3A%2F%2F192.168.6.224%3A8787%2Fsub%2Fabc_123-example",
  );
});

test("installs Shadowrocket through its configuration entry", () => {
  // `shadowrocket://add/` would add a node subscription and drop every rule in
  // the file; `config/add` is the entry that reads the whole configuration.
  // The documented form carries the address as the path, unencoded, so the
  // query string of a stateless link has to survive intact.
  assert.equal(supportsClientInstallQr("shadowrocket"), true);
  assert.equal(
    qrImportValue("shadowrocket", subscriptionUrl, "install"),
    `shadowrocket://config/add/${subscriptionUrl}`,
  );
  assert.equal(
    qrImportValue(
      "shadowrocket",
      "https://sub.example.test/sub?url=https%3A%2F%2Fprovider.test%2Fs&emoji=true",
      "install",
    ),
    "shadowrocket://config/add/https://sub.example.test/sub?url=https%3A%2F%2Fprovider.test%2Fs&emoji=true",
  );
  assert.equal(clientInstallLabel("shadowrocket"), "一键导入 Shadowrocket");
  assert.match(clientInstallQrHint("shadowrocket"), /Shadowrocket/);
});

test("keeps raw URLs for explicit raw mode and unsupported clients", () => {
  assert.equal(qrImportValue("clash", subscriptionUrl, "raw"), subscriptionUrl);
  assert.equal(supportsClientInstallQr("singbox"), false);
  assert.equal(
    qrImportValue("singbox", subscriptionUrl, "install"),
    subscriptionUrl,
  );
  assert.equal(clientInstallLabel("singbox"), "");
  assert.match(clientInstallQrHint("singbox"), /QR/);
});

test("shows the code the client's own import entry can actually read", () => {
  // Each scanner refuses what the other one needs. ClashMetaForAndroid's scan
  // entry answers "Unsupported url clash://install-config?…" and writes plain
  // addresses straight into its address field, so Mihomo clients open on the
  // address. Shadowrocket's scan entry takes node subscriptions only, which
  // would drop every rule, so that one opens on the scheme.
  assert.equal(defaultQrImportMode("clash"), "raw");
  assert.equal(defaultQrImportMode("shadowrocket"), "install");
  assert.equal(defaultQrImportMode("singbox"), "raw");

  // Both codes stay available, and each hint names the entry that reads it.
  assert.match(clientInstallQrHint("clash", "raw"), /客户端/);
  assert.match(clientInstallQrHint("clash", "install"), /系统相机/);
  assert.match(clientInstallQrHint("clash", "install"), /Unsupported url/);
  assert.match(clientInstallQrHint("shadowrocket", "install"), /系统相机/);
  assert.match(clientInstallQrHint("shadowrocket", "raw"), /节点订阅/);
});
