import assert from "node:assert/strict";
import test from "node:test";
import {
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

test("keeps raw URLs for explicit raw mode and unsupported clients", () => {
  assert.equal(qrImportValue("clash", subscriptionUrl, "raw"), subscriptionUrl);
  assert.equal(supportsClientInstallQr("singbox"), false);
  assert.equal(
    qrImportValue("singbox", subscriptionUrl, "install"),
    subscriptionUrl,
  );
});
