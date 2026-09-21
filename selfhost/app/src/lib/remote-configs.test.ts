import assert from "node:assert/strict";
import test from "node:test";
import {
  BUILTIN_REMOTE_CONFIG_ID,
  LITE_REMOTE_CONFIG_ID,
  isCustomRemoteConfig,
  isRemoteConfigTargetSupported,
  parseRemoteConfigPresets,
  resolveRemoteConfig,
} from "./remote-configs";

const FIXED = "config/ekko-rules-selfhost.ini";

test("always offers this repository's own rules first and by default", () => {
  const presets = parseRemoteConfigPresets(undefined, FIXED);
  assert.equal(presets[0].id, BUILTIN_REMOTE_CONFIG_ID);
  assert.equal(presets[0].value, FIXED);
  assert.equal(presets[0].builtin, true);
  assert.equal(resolveRemoteConfig("", presets, false).id, BUILTIN_REMOTE_CONFIG_ID);
  assert.equal(
    resolveRemoteConfig(undefined, presets, false).id,
    BUILTIN_REMOTE_CONFIG_ID,
  );
});

test("ships third-party presets that can be switched off entirely", () => {
  const withThirdParty = parseRemoteConfigPresets(undefined, FIXED);
  assert.equal(withThirdParty.length > 1, true);
  assert.equal(
    withThirdParty.every(
      (preset) =>
        preset.builtin || preset.value.startsWith("https://"),
    ),
    true,
  );
  // Both products this repository maintains are builtin; everything after them
  // is somebody else's file on somebody else's server.
  assert.equal(withThirdParty.filter((preset) => preset.builtin).length, 2);

  const ekkoOnly = parseRemoteConfigPresets(undefined, FIXED, false);
  assert.deepEqual(ekkoOnly.map((preset) => preset.id), [
    BUILTIN_REMOTE_CONFIG_ID,
    LITE_REMOTE_CONFIG_ID,
  ]);
});

test("accepts operator presets and drops unusable entries", () => {
  const presets = parseRemoteConfigPresets(
    JSON.stringify([
      { id: "alt", label: "Alt", url: "https://example.test/alt.ini" },
      { id: "ekko", label: "shadowing the builtin", url: "https://example.test/x.ini" },
      { id: "Bad Id", url: "https://example.test/y.ini" },
      { id: "insecure", url: "http://example.test/z.ini" },
      { id: "missing-url" },
    ]),
    FIXED,
    false,
  );
  assert.deepEqual(
    presets.map((preset) => preset.id),
    [BUILTIN_REMOTE_CONFIG_ID, LITE_REMOTE_CONFIG_ID, "alt"],
  );
  assert.equal(presets[2].value, "https://example.test/alt.ini");
});

test("survives malformed REMOTE_CONFIGS without failing startup", () => {
  assert.equal(parseRemoteConfigPresets("{not json", FIXED, false).length, 2);
  assert.equal(parseRemoteConfigPresets('"a string"', FIXED, false).length, 2);
});

test("resolves a link's config id and refuses anything unlisted", () => {
  const presets = parseRemoteConfigPresets(
    JSON.stringify([{ id: "alt", url: "https://example.test/alt.ini" }]),
    FIXED,
    false,
  );
  assert.equal(resolveRemoteConfig("", presets, false).id, BUILTIN_REMOTE_CONFIG_ID);
  assert.equal(resolveRemoteConfig("alt", presets, false).value, "https://example.test/alt.ini");
  assert.throws(
    () => resolveRemoteConfig("https://attacker.test/evil.ini", presets, false),
    /remoteConfig is not an available option/,
  );
  assert.throws(() => resolveRemoteConfig("unknown", presets, false), /remoteConfig/);
});

test("accepts a pasted https config and rejects unusable ones", () => {
  const presets = parseRemoteConfigPresets(undefined, FIXED, false);
  const custom = resolveRemoteConfig("https://example.test/own.ini", presets, true);
  assert.equal(custom.value, "https://example.test/own.ini");
  assert.equal(custom.builtin, false);
  assert.equal(isCustomRemoteConfig(custom), true);
  assert.equal(isCustomRemoteConfig(presets[0]), false);

  for (const rejected of [
    "http://example.test/own.ini",
    "https://user:pass@example.test/own.ini",
    "ftp://example.test/own.ini",
    `https://example.test/${"a".repeat(600)}.ini`,
  ]) {
    assert.throws(
      () => resolveRemoteConfig(rejected, presets, true),
      /remoteConfig must be a valid https URL|too long/,
      rejected,
    );
  }

  // A value that is not a URL can only have been meant as a preset id.
  for (const unlisted of ["not a url", "acl4ssr-nonexistent", "ekko2"]) {
    assert.throws(
      () => resolveRemoteConfig(unlisted, presets, true),
      /remoteConfig is not an available option/,
      unlisted,
    );
  }
});

test("a deployment can still refuse pasted config URLs", () => {
  const presets = parseRemoteConfigPresets(undefined, FIXED, false);
  assert.throws(
    () => resolveRemoteConfig("https://example.test/own.ini", presets, false),
    /remoteConfig is not an available option/,
  );
});

test("allows native Shadowrocket output for built-in and third-party configs", () => {
  const presets = parseRemoteConfigPresets(undefined, FIXED);
  const full = presets.find((preset) => preset.id === BUILTIN_REMOTE_CONFIG_ID)!;
  const lite = presets.find((preset) => preset.id === LITE_REMOTE_CONFIG_ID)!;
  const thirdParty = presets.find((preset) => !preset.builtin)!;

  assert.equal(isRemoteConfigTargetSupported(full, "shadowrocket"), true);
  assert.equal(isRemoteConfigTargetSupported(lite, "shadowrocket"), true);
  assert.equal(isRemoteConfigTargetSupported(thirdParty, "shadowrocket"), true);
  assert.equal(isRemoteConfigTargetSupported(thirdParty, "clash"), true);
});
