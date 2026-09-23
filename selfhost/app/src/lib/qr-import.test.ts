import assert from "node:assert/strict";
import test from "node:test";
import {
  clientInstallLabel,
  qrCodeValue,
  qrImportValue,
  qrScanHint,
  shadowrocketConfigImportValue,
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

test("gives Shadowrocket separate node and configuration imports", () => {
  // Shadowrocket needs both objects: a refreshable Home subscription for the
  // banner and nodes, then a native config for rules and policy groups.
  assert.equal(supportsClientInstallQr("shadowrocket"), true);
  assert.equal(
    qrImportValue("shadowrocket", subscriptionUrl, "install"),
    `shadowrocket://add/${subscriptionUrl}`,
  );
  assert.equal(
    shadowrocketConfigImportValue(
      "https://sub.example.test/sub?url=https%3A%2F%2Fprovider.test%2Fs&emoji=true",
    ),
    "shadowrocket://config/add/https://sub.example.test/sub?url=https%3A%2F%2Fprovider.test%2Fs&emoji=true",
  );
  assert.equal(clientInstallLabel("shadowrocket"), "① 导入节点订阅");
});

test("keeps raw URLs for explicit raw mode and unsupported clients", () => {
  assert.equal(qrImportValue("clash", subscriptionUrl, "raw"), subscriptionUrl);
  assert.equal(supportsClientInstallQr("quanx"), false);
  assert.equal(
    qrImportValue("quanx", subscriptionUrl, "install"),
    subscriptionUrl,
  );
  assert.equal(clientInstallLabel("quanx"), "");
});

test("keeps both Shadowrocket QR payloads as ordinary HTTPS addresses", () => {
  const namedConfig = "https://sub.example.test/i/laomao.conf?p=00";
  assert.equal(
    qrCodeValue("shadowrocket", namedConfig, "laomao"),
    namedConfig,
  );
  assert.equal(
    qrImportValue("shadowrocket", namedConfig, "install", "laomao"),
    `shadowrocket://add/${namedConfig}`,
  );
  assert.equal(
    shadowrocketConfigImportValue(namedConfig),
    `shadowrocket://config/add/${namedConfig}`,
  );
  assert.equal(qrCodeValue("clash", namedConfig, "laomao"), namedConfig);
});

test("directs Shadowrocket users through both import steps", () => {
  assert.match(qrScanHint("clash"), /扫哪个都行/);
  assert.match(qrScanHint("singbox"), /扫哪个都行/);
  assert.match(qrScanHint("shadowrocket"), /首页/);
  assert.match(qrScanHint("shadowrocket"), /配置页/);
});

test("every client whose vendor documents a scheme gets a one-tap button", () => {
  // A phone visiting the site should not have to copy anything. Each of these
  // is the form its own vendor documents; Quantumult X is absent on purpose,
  // because its scheme takes remote resources rather than a whole config.
  const url = "https://sub.example.test/i?p=dXJs";
  assert.equal(
    qrImportValue("singbox", url, "install", "家里"),
    `sing-box://import-remote-profile?url=${encodeURIComponent(url)}#${encodeURIComponent("家里")}`,
  );
  assert.equal(
    qrImportValue("singbox", url, "install"),
    `sing-box://import-remote-profile?url=${encodeURIComponent(url)}`,
  );
  assert.equal(
    qrImportValue("surge", url, "install"),
    `surge:///install-config?url=${encodeURIComponent(url)}`,
  );
  assert.equal(
    qrImportValue("loon", url, "install"),
    `loon://import?sub=${encodeURIComponent(url)}`,
  );
  assert.equal(
    qrImportValue("surfboard", url, "install"),
    `surfboard:///install-config?url=${encodeURIComponent(url)}`,
  );
  for (const target of ["singbox", "surge", "loon", "surfboard"]) {
    assert.match(clientInstallLabel(target), /^一键导入 /);
  }

  // Left out until their own vendor documents one.
  for (const target of ["quanx", "quan", "mellow"]) {
    assert.equal(supportsClientInstallQr(target), false);
    assert.equal(qrImportValue(target, url, "install"), url);
  }
});
