import assert from "node:assert/strict";
import test from "node:test";
import {
  clientInstallLabel,
  clientInstallQrHint,
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
