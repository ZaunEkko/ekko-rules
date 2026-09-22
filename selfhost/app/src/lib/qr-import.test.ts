import assert from "node:assert/strict";
import test from "node:test";
import {
  clientInstallLabel,
  qrCodeValue,
  qrImportValue,
  qrScanHint,
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

test("keeps the Shadowrocket QR as HTTPS while its button uses config/add", () => {
  // Real-device home scanning ignores a config/add QR without an error. The
  // HTTPS payload must not be replaced with that unsupported scanner action.
  const namedConfig = "https://sub.example.test/i/laomao.yaml?srhome=1&p=00&remark=laomao";
  assert.equal(
    qrCodeValue("shadowrocket", namedConfig, "laomao"),
    namedConfig,
  );
  assert.equal(
    qrImportValue("shadowrocket", namedConfig, "install", "laomao"),
    `shadowrocket://config/add/${namedConfig}`,
  );
  assert.equal(qrCodeValue("clash", namedConfig, "laomao"), namedConfig);
});

test("describes the Shadowrocket scanner action", () => {
  assert.match(qrScanHint("clash"), /扫哪个都行/);
  assert.match(qrScanHint("singbox"), /扫哪个都行/);
  assert.match(qrScanHint("shadowrocket"), /首页或配置页入口/);
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
