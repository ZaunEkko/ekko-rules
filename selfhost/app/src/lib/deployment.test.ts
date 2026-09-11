import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateDeployment,
  normalizePublicBaseUrl,
  parseDeployMode,
  storesProfiles,
} from "./deployment";

test("defaults to the personal LAN deployment mode", () => {
  assert.equal(parseDeployMode(undefined), "lan");
  assert.equal(parseDeployMode(""), "lan");
  assert.equal(parseDeployMode("lan"), "lan");
  assert.equal(parseDeployMode("anything-else"), "lan");
  assert.equal(parseDeployMode(" PUBLIC "), "public");
  assert.equal(parseDeployMode("open"), "public");
});

test("only the personal deployment keeps subscriptions on disk", () => {
  assert.equal(storesProfiles("lan"), true);
  assert.equal(storesProfiles("public"), false);
});

test("an open deployment needs no password because it stores nothing", () => {
  const open = evaluateDeployment({
    mode: "public",
    publicBaseUrl: "https://sub.example.com",
  });
  assert.equal(open.error, "");
  assert.equal(open.storesProfiles, false);
  assert.equal(open.trustProxyHeaders, true);
});

test("LAN mode stays usable without an access password", () => {
  const policy = evaluateDeployment({ mode: "lan" });
  assert.equal(policy.mode, "lan");
  assert.equal(policy.error, "");
  assert.equal(policy.accessPasswordConfigured, false);
  assert.equal(policy.trustProxyHeaders, false);
});



test("public mode rejects an unusable export origin", () => {
  const policy = evaluateDeployment({
    mode: "public",
    publicBaseUrl: "https://sub.example.com/path",
  });
  assert.match(policy.error, /PUBLIC_BASE_URL/);
  assert.equal(policy.publicBaseUrl, "");
});

test("public mode warns when the export origin is not HTTPS", () => {
  const secure = evaluateDeployment({
    mode: "public",
    publicBaseUrl: "https://sub.example.com",
  });
  assert.equal(secure.publicBaseUrl, "https://sub.example.com");
  assert.equal(secure.warning, "");

  const cleartext = evaluateDeployment({
    mode: "public",
    publicBaseUrl: "http://203.0.113.10:8787",
  });
  assert.equal(cleartext.error, "");
  assert.match(cleartext.warning, /明文/);
});

test("warns when a LAN deployment shares one profile list with no password", () => {
  const exposed = evaluateDeployment({ mode: "lan", webBindHost: "0.0.0.0" });
  assert.match(exposed.warning, /ACCESS_PASSWORD/);

  assert.equal(
    evaluateDeployment({ mode: "lan", webBindHost: "127.0.0.1" }).warning,
    "",
  );
  assert.equal(
    evaluateDeployment({
      mode: "lan",
      webBindHost: "0.0.0.0",
      accessPassword: "lan-secret",
    }).warning,
    "",
  );
});

test("reads additional origins and drops unusable ones", () => {
  const policy = evaluateDeployment({
    mode: "public",
    publicBaseUrl: "https://sub.example.com",
    altOrigins: "https://sub.example.net, http://plain.example.org , , nonsense, https://x.example.com/path",
  });
  assert.deepEqual(policy.altOrigins, [
    "https://sub.example.net",
    "http://plain.example.org",
  ]);
  assert.deepEqual(evaluateDeployment({ mode: "public" }).altOrigins, []);
});

test("normalizes an export origin and drops credentials or queries", () => {
  assert.deepEqual(normalizePublicBaseUrl("https://sub.example.com/"), {
    value: "https://sub.example.com",
    error: "",
  });
  assert.equal(normalizePublicBaseUrl("https://a:b@sub.example.com").value, "");
  assert.equal(normalizePublicBaseUrl("ftp://sub.example.com").value, "");
  assert.deepEqual(normalizePublicBaseUrl(" "), { value: "", error: "" });
});

test("proxy header trust follows the deployment mode unless set explicitly", () => {
  assert.equal(
    evaluateDeployment({ mode: "public" }).trustProxyHeaders,
    true,
  );
  assert.equal(
    evaluateDeployment({ mode: "public", trustProxyHeaders: "0" })
      .trustProxyHeaders,
    false,
  );
  assert.equal(
    evaluateDeployment({ mode: "lan", trustProxyHeaders: "true" })
      .trustProxyHeaders,
    true,
  );
});
