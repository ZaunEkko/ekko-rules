import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_CONVERT_OPTIONS,
  RECOMMENDED_CONVERT_OPTIONS,
} from "./options";
import {
  buildStatelessConvertQuery,
  buildStatelessSubscriptionUrl,
  clientImportPath,
  packStatelessQuery,
  parseStatelessConvertQuery,
  shadowrocketConfigImportPath,
  shadowrocketConfigProfilePath,
  shadowrocketHomeImportPath,
  shadowrocketHomeProfilePath,
} from "./stateless-request";

test("gives Shadowrocket a named native configuration path", () => {
  assert.equal(
    clientImportPath("shadowrocket", "laomao-ssr", "p=abc123"),
    "/i/laomao-ssr.conf?p=abc123",
  );
  assert.equal(
    clientImportPath("shadowrocket", "测试/配置.conf", "p=abc123"),
    `/i/${encodeURIComponent("测试-配置")}.conf?p=abc123`,
  );
  assert.equal(
    clientImportPath("clash", "ignored", "p=abc123"),
    "/i?p=abc123",
  );
});

test("keeps the same choices for a named Shadowrocket home-scanner YAML", () => {
  const query = buildStatelessConvertQuery({
    subscriptionUrl: "https://example.test/private?token=abc",
    target: "shadowrocket",
    name: "laomao-ssr",
    remoteConfig: "ekko-lite",
    options: { emoji: true, udp: true },
  });
  const path = shadowrocketHomeImportPath("laomao-ssr", query);
  assert.match(path, /^\/i\/laomao-ssr\.yaml\?srhome=1&p=[A-Za-z0-9_-]+&remark=laomao-ssr$/);
  const parsed = parseStatelessConvertQuery(new URL(path, "https://example.test").searchParams);
  assert.equal(parsed.target, "clash");
  assert.equal(parsed.subscriptionUrl, "https://example.test/private?token=abc");
  assert.equal(parsed.remoteConfig, "ekko-lite");
  assert.equal(parsed.options.udp, true);
  assert.equal(parsed.name, "laomao-ssr");
  assert.equal(new URL(path, "https://example.test").searchParams.get("remark"), "laomao-ssr");
  assert.equal(shadowrocketHomeProfilePath("abc", "手机/节点.conf"),
    `/sub/abc/${encodeURIComponent("手机-节点")}.yaml?srhome=1&remark=${encodeURIComponent("手机-节点")}`);
});

test("keeps config-page Shadowrocket scanning on a separate YAML address", () => {
  const query = buildStatelessConvertQuery({
    subscriptionUrl: "https://example.test/private?token=abc",
    target: "shadowrocket",
    name: "laomao-ssr",
    remoteConfig: "ekko",
    options: { emoji: true },
  });
  const path = shadowrocketConfigImportPath("laomao-ssr", query);
  assert.match(path, /^\/i\/laomao-ssr\.yaml\?srconfig=1&p=[A-Za-z0-9_-]+&remark=laomao-ssr$/);
  assert.notEqual(path, shadowrocketHomeImportPath("laomao-ssr", query));
  const parsed = parseStatelessConvertQuery(new URL(path, "https://example.test").searchParams);
  assert.equal(parsed.target, "clash");
  assert.equal(parsed.subscriptionUrl, "https://example.test/private?token=abc");
  assert.equal(shadowrocketConfigProfilePath("abc", "手机/节点.conf"),
    `/sub/abc/${encodeURIComponent("手机-节点")}.yaml?srconfig=1&remark=${encodeURIComponent("手机-节点")}`);
});

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

test("a packed link survives a client that re-reads the address its own way", () => {
  // The failure it exists for: inside `clash://install-config?url=…` a client
  // kept only what preceded the provider's own `?`, which dropped the token
  // and left a profile that fetched nothing. Packed, the address has no `?`,
  // no `&` and no escapes of its own.
  const query = buildStatelessConvertQuery({
    subscriptionUrl: "https://provider.example/api/v1/client/subscribe?token=abc123",
    target: "shadowrocket",
    options: { ...DEFAULT_CONVERT_OPTIONS, udp: true },
    name: "laomao",
  });
  const packed = packStatelessQuery(query);
  assert.match(packed, /^p=[A-Za-z0-9_-]+$/);

  const parsed = parseStatelessConvertQuery(new URLSearchParams(packed));
  assert.equal(
    parsed.subscriptionUrl,
    "https://provider.example/api/v1/client/subscribe?token=abc123",
  );
  assert.equal(parsed.target, "shadowrocket");
  assert.equal(parsed.options.udp, true);
  assert.equal(parsed.name, "laomao");

  // Same request either way.
  assert.deepEqual(parsed, parseStatelessConvertQuery(new URLSearchParams(query)));
});

test("a packed link that arrives damaged is refused rather than half-read", () => {
  assert.throws(
    () => parseStatelessConvertQuery(new URLSearchParams("p=not base64!")),
    /supported subscription link/i,
  );
  assert.throws(
    () => parseStatelessConvertQuery(new URLSearchParams("p=dGFyZ2V0PWNsYXNo")),
    /subscriptionUrl is required/i,
  );
});
