import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_CONVERT_OPTIONS } from "./options";
import {
  buildStatelessConvertQuery,
  buildStatelessSubscriptionUrl,
  parseStatelessConvertQuery,
} from "./stateless-request";

test("reads a stateless conversion request out of its own link", () => {
  const parsed = parseStatelessConvertQuery(
    new URLSearchParams(
      "url=https://example.test/sub&target=singbox&udp=true&fdn=false&include=HK&interval=12&name=主力&config=acl4ssr-full",
    ),
  );
  assert.equal(parsed.subscriptionUrl, "https://example.test/sub");
  assert.equal(parsed.target, "singbox");
  assert.equal(parsed.name, "主力");
  assert.equal(parsed.remoteConfig, "acl4ssr-full");
  assert.equal(parsed.options.udp, true);
  assert.equal(parsed.options.filterUnsupported, false);
  assert.equal(parsed.options.include, "HK");
  assert.equal(parsed.options.autoUpdate, true);
  assert.equal(parsed.options.updateIntervalHours, 12);
  // Switches nobody touched keep the shared defaults.
  assert.equal(parsed.options.emoji, DEFAULT_CONVERT_OPTIONS.emoji);
});

test("defaults to Mihomo and refuses an unusable link", () => {
  assert.equal(
    parseStatelessConvertQuery(new URLSearchParams("url=https://example.test/sub"))
      .target,
    "clash",
  );
  assert.throws(
    () => parseStatelessConvertQuery(new URLSearchParams("target=clash")),
    /subscriptionUrl is required/,
  );
  assert.throws(
    () =>
      parseStatelessConvertQuery(
        new URLSearchParams("url=https://example.test/sub&target=nonsense"),
      ),
    /supported target/,
  );
  assert.throws(
    () =>
      parseStatelessConvertQuery(
        new URLSearchParams("url=https://example.test/sub&udp=maybe"),
      ),
    /udp must be true or false/,
  );
  for (const interval of ["0", "169", "2.5", "abc"]) {
    assert.throws(
      () =>
        parseStatelessConvertQuery(
          new URLSearchParams(`url=https://example.test/sub&interval=${interval}`),
        ),
      /between 1 and 168/,
      interval,
    );
  }
  assert.throws(
    () =>
      parseStatelessConvertQuery(
        new URLSearchParams(
          `url=https://example.test/sub&name=${"x".repeat(51)}`,
        ),
      ),
    /50 characters or fewer/,
  );
});

test("a link carries only the choices that differ from the defaults", () => {
  const params = new URLSearchParams(
    buildStatelessConvertQuery({
      subscriptionUrl: "https://example.test/sub",
      target: "clash",
      options: { udp: true },
    }),
  );
  assert.equal(params.get("url"), "https://example.test/sub");
  assert.equal(params.get("target"), "clash");
  assert.equal(params.get("udp"), "true");
  assert.equal(params.get("emoji"), null);
  assert.equal(params.get("interval"), null);
  assert.equal(params.get("config"), null);
});

test("a built link parses back into the same request", () => {
  const url = buildStatelessSubscriptionUrl("https://sub.example.com/", {
    subscriptionUrl: "https://example.test/sub?token=abc",
    target: "surge",
    options: {
      emoji: false,
      rename: "a@b",
      autoUpdate: true,
      updateIntervalHours: 6,
    },
    name: "手机",
    remoteConfig: "acl4ssr-mini",
  });
  assert.equal(url.startsWith("https://sub.example.com/sub?"), true);

  const parsed = parseStatelessConvertQuery(new URL(url).searchParams);
  assert.equal(parsed.subscriptionUrl, "https://example.test/sub?token=abc");
  assert.equal(parsed.target, "surge");
  assert.equal(parsed.options.emoji, false);
  assert.equal(parsed.options.rename, "a@b");
  assert.equal(parsed.options.autoUpdate, true);
  assert.equal(parsed.options.updateIntervalHours, 6);
  assert.equal(parsed.name, "手机");
  assert.equal(parsed.remoteConfig, "acl4ssr-mini");
});
