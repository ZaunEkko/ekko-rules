import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_CONVERT_OPTIONS,
  RECOMMENDED_CONVERT_OPTIONS,
} from "./options";
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

test("an omitted parameter keeps the meaning it had when the link was made", () => {
  // A stateless link carries only what differs from DEFAULT_CONVERT_OPTIONS,
  // so those values are a contract with every link already in circulation.
  // Changing one silently rewrites what an old link asks for: someone who
  // imported a link months ago would get a different configuration on its next
  // refresh without having touched anything. The recommendations the form
  // starts with live in RECOMMENDED_CONVERT_OPTIONS instead, and a link states
  // them outright.
  const legacy = parseStatelessConvertQuery(
    new URLSearchParams("url=https%3A%2F%2Fexample.test%2Fsub&target=clash"),
  );
  assert.deepEqual(legacy.options, DEFAULT_CONVERT_OPTIONS);
  for (const [name, value] of Object.entries(DEFAULT_CONVERT_OPTIONS)) {
    assert.equal(
      legacy.options?.[name as keyof typeof DEFAULT_CONVERT_OPTIONS],
      value,
      `a link with no parameters must still mean ${name} = ${value}`,
    );
  }

  // And the recommendations really do differ, so the form's choices reach the
  // link by being written into it rather than by being assumed.
  const written = new URLSearchParams(
    buildStatelessConvertQuery({
      subscriptionUrl: "https://example.test/sub",
      target: "clash",
      options: RECOMMENDED_CONVERT_OPTIONS,
    }),
  );
  assert.equal(written.get("udp"), "true");
  assert.equal(written.get("xudp"), "true");
});
