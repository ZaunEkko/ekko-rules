import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  authorizeLocalAccess,
  applyConvertOptions,
  cleanupOrphanedConversionInputs,
  getRuntimeConfig,
  inlineMihomoProviderNodes,
  isJsonRequestContentType,
  looksLikeSubscription,
  normalizeSubscriptionContent,
  publicErrorStatus,
  sanitizeSourceUserAgent,
  sanitizeSubscriptionUserinfo,
  subscriptionUserinfoFromStatus,
  selectUpstreamUserAgent,
  upstreamUserAgentAttempts,
  isLoopbackBindHost,
  normalizeSubscriptionBaseUrl,
  requestTextWithLimits,
} from "./convert";
import { DEFAULT_CONVERT_OPTIONS } from "./options";

async function listenOnLoopback(server: Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server did not expose a TCP port.");
  }
  return address.port;
}

async function closeServer(server: Server): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test("keeps the Mihomo base local by default and preserves fallback coverage", async () => {
  const base = await readFile(
    new URL("../../../subconverter/base/ekko-rules-base.yaml", import.meta.url),
    "utf8",
  );

  assert.match(base, /^allow-lan: false$/m);
  assert.match(base, /^bind-address: 127\.0\.0\.1$/m);
  assert.match(base, /^  listen: 127\.0\.0\.1:53$/m);
  assert.match(base, /^    "geosite:gfw":$/m);
  assert.match(base, /^  fallback:$/m);
  // DIRECT exits must not inherit the overseas DoT policy: those upstreams are
  // often unreachable from the mainland, and a direct connection wants the
  // mainland answer anyway (see ER-075).
  assert.match(
    base,
    /^  direct-nameserver:\n    - 119\.29\.29\.29\n    - 223\.5\.5\.5\n  direct-nameserver-follow-policy: false$/m,
  );

  const fallbackFilter = base.slice(base.indexOf("  fallback-filter:"));
  assert.doesNotMatch(fallbackFilter, /^    geosite:$/m);
});

test("normalizes safe upstream subscription usage metadata", () => {
  assert.equal(
    sanitizeSubscriptionUserinfo(
      "expire=1798761600; total=268435456000; download=4273492459; upload=42",
    ),
    "upload=42; download=4273492459; total=268435456000; expire=1798761600",
  );
});

test("drops unsupported or unsafe subscription usage metadata", () => {
  assert.equal(
    sanitizeSubscriptionUserinfo(
      "upload=-1; download=1\r\nX-Evil: yes; total=100; plan=premium",
    ),
    "total=100",
  );
  assert.equal(sanitizeSubscriptionUserinfo("plan=premium"), undefined);
});

test("accepts a bounded client user agent and rejects control characters", () => {
  assert.equal(
    sanitizeSourceUserAgent("  clash-verge-rev/2.4.3  "),
    "clash-verge-rev/2.4.3",
  );
  assert.equal(sanitizeSourceUserAgent("clash\r\nX-Evil: yes"), undefined);
  assert.equal(sanitizeSourceUserAgent("x".repeat(257)), undefined);
});

test("uses client user agents but replaces browser agents with target defaults", () => {
  assert.equal(
    selectUpstreamUserAgent("clash", "", "clash-verge-rev/2.4.3"),
    "clash-verge-rev/2.4.3",
  );
  assert.equal(
    selectUpstreamUserAgent("clash", "", "Mozilla/5.0 Chrome/140"),
    "clash.meta",
  );
  assert.equal(
    selectUpstreamUserAgent("singbox", "AirportClient/1", "Mozilla/5.0"),
    "AirportClient/1",
  );
});

test("distinguishes loopback and LAN bind hosts", () => {
  assert.equal(isLoopbackBindHost("127.0.0.1"), true);
  assert.equal(isLoopbackBindHost("::1"), true);
  assert.equal(isLoopbackBindHost("0.0.0.0"), false);
  assert.equal(isLoopbackBindHost("192.168.1.20"), false);
});

test("normalizes an optional LAN subscription origin", () => {
  assert.deepEqual(normalizeSubscriptionBaseUrl(undefined), {
    value: "",
    error: "",
  });
  assert.deepEqual(normalizeSubscriptionBaseUrl("http://192.168.1.20:8787"), {
    value: "http://192.168.1.20:8787",
    error: "",
  });
  assert.match(
    normalizeSubscriptionBaseUrl("http://user:pass@host/path").error,
    /LAN_BASE_URL/,
  );
});

test("publishes to the LAN by default while keeping management passwords optional", () => {
  const previousBindHost = process.env.WEB_BIND_HOST;
  const previousPassword = process.env.ACCESS_PASSWORD;
  try {
    delete process.env.WEB_BIND_HOST;
    delete process.env.ACCESS_PASSWORD;
    assert.equal(getRuntimeConfig().webBindHost, "0.0.0.0");
    assert.equal(getRuntimeConfig().lanAccessEnabled, true);
    assert.equal(getRuntimeConfig().subscriptionBaseUrlError, "");
    assert.doesNotThrow(() => authorizeLocalAccess());

    process.env.ACCESS_PASSWORD = "lan-secret";
    assert.doesNotThrow(() => authorizeLocalAccess("lan-secret"));
    assert.throws(() => authorizeLocalAccess("wrong"), /password/i);
  } finally {
    if (previousBindHost === undefined) delete process.env.WEB_BIND_HOST;
    else process.env.WEB_BIND_HOST = previousBindHost;
    if (previousPassword === undefined) delete process.env.ACCESS_PASSWORD;
    else process.env.ACCESS_PASSWORD = previousPassword;
  }
});

test("treats the advertised LAN origin as a frontend-only hint", () => {
  const previousBaseUrl = process.env.LAN_BASE_URL;
  const previousPassword = process.env.ACCESS_PASSWORD;
  try {
    process.env.ACCESS_PASSWORD = "management-secret";
    process.env.LAN_BASE_URL = "http://lan.example.test/with-path";
    const runtime = getRuntimeConfig();
    assert.equal(runtime.subscriptionBaseUrl, "");
    assert.match(runtime.subscriptionBaseUrlError, /LAN_BASE_URL/);
    assert.doesNotThrow(() => authorizeLocalAccess("management-secret"));
    assert.throws(() => authorizeLocalAccess("wrong"), /password/i);
  } finally {
    if (previousBaseUrl === undefined) delete process.env.LAN_BASE_URL;
    else process.env.LAN_BASE_URL = previousBaseUrl;
    if (previousPassword === undefined) delete process.env.ACCESS_PASSWORD;
    else process.env.ACCESS_PASSWORD = previousPassword;
  }
});

test("refuses to run an open deployment with an unusable export origin", () => {
  const previousMode = process.env.SELFHOST_MODE;
  const previousBaseUrl = process.env.PUBLIC_BASE_URL;
  try {
    process.env.SELFHOST_MODE = "public";
    process.env.PUBLIC_BASE_URL = "https://sub.example.test/with-path";

    const blocked = getRuntimeConfig();
    assert.match(blocked.deploymentError, /PUBLIC_BASE_URL/);
    assert.equal(publicErrorStatus(blocked.deploymentError), 503);
    assert.throws(() => authorizeLocalAccess(), /PUBLIC_BASE_URL/);

    process.env.PUBLIC_BASE_URL = "https://sub.example.test";
    const ready = getRuntimeConfig();
    assert.equal(ready.deploymentError, "");
    assert.equal(ready.subscriptionBaseUrl, "https://sub.example.test");
    assert.equal(ready.trustProxyHeaders, true);
    assert.equal(ready.subscribeRateLimitPerMinute > 0, true);
    assert.equal(ready.manageRateLimitPerMinute > 0, true);
  } finally {
    if (previousMode === undefined) delete process.env.SELFHOST_MODE;
    else process.env.SELFHOST_MODE = previousMode;
    if (previousBaseUrl === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = previousBaseUrl;
  }
});

test("an open deployment stores nothing and needs no password", () => {
  const previousMode = process.env.SELFHOST_MODE;
  const previousPassword = process.env.ACCESS_PASSWORD;
  try {
    process.env.SELFHOST_MODE = "public";
    // Even a stray password cannot half-close a door that is meant to be open.
    process.env.ACCESS_PASSWORD = "ignored-here";
    const runtime = getRuntimeConfig();
    assert.equal(runtime.deployMode, "public");
    assert.equal(runtime.storedProfilesEnabled, false);
    assert.equal(runtime.deploymentError, "");
    assert.doesNotThrow(() => authorizeLocalAccess());
    assert.doesNotThrow(() => authorizeLocalAccess("anything"));
    // Ekko Rules stays first and is what an empty `config` resolves to.
    assert.equal(runtime.remoteConfigs[0].id, "ekko");
    assert.equal(runtime.remoteConfigs[0].builtin, true);
    assert.equal(runtime.remoteConfigs.length > 1, true);
    assert.equal(runtime.allowCustomRemoteConfig, true);
  } finally {
    if (previousMode === undefined) delete process.env.SELFHOST_MODE;
    else process.env.SELFHOST_MODE = previousMode;
    if (previousPassword === undefined) delete process.env.ACCESS_PASSWORD;
    else process.env.ACCESS_PASSWORD = previousPassword;
  }
});

test("keeps rate limits off for the personal LAN deployment", () => {
  const previousMode = process.env.SELFHOST_MODE;
  try {
    delete process.env.SELFHOST_MODE;
    const runtime = getRuntimeConfig();
    assert.equal(runtime.deployMode, "lan");
    assert.equal(runtime.manageRateLimitPerMinute, 0);
    assert.equal(runtime.subscribeRateLimitPerMinute, 0);
    assert.equal(runtime.trustProxyHeaders, false);
  } finally {
    if (previousMode === undefined) delete process.env.SELFHOST_MODE;
    else process.env.SELFHOST_MODE = previousMode;
  }
});

test("accepts JSON media types and rejects simple cross-origin content types", () => {
  assert.equal(isJsonRequestContentType("application/json"), true);
  assert.equal(
    isJsonRequestContentType("Application/Problem+Json; charset=utf-8"),
    true,
  );
  assert.equal(isJsonRequestContentType("text/plain"), false);
  assert.equal(
    isJsonRequestContentType("application/x-www-form-urlencoded"),
    false,
  );
  assert.equal(isJsonRequestContentType(null), false);
});

test("uses the validated DNS addresses for the actual HTTP connection", async () => {
  const server = createServer((request, response) => {
    response.end(request.headers.host || "");
  });
  const port = await listenOnLoopback(server);
  try {
    const result = await requestTextWithLimits(
      `http://rebinding.invalid:${port}/subscription`,
      {
        timeoutMs: 1_000,
        maxBytes: 1_024,
        requestLabel: "Pinned request",
        resolvedAddresses: ["127.0.0.1"],
      },
    );
    assert.equal(result.ok, true);
    assert.equal(result.body, `rebinding.invalid:${port}`);
  } finally {
    await closeServer(server);
  }
});

test("keeps the deadline active while reading the response body", async () => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/plain" });
    response.write("partial");
  });
  const port = await listenOnLoopback(server);
  try {
    await assert.rejects(
      requestTextWithLimits(`http://127.0.0.1:${port}/slow`, {
        timeoutMs: 150,
        maxBytes: 1_024,
        requestLabel: "Slow body",
      }),
      /Slow body timed out/,
    );
  } finally {
    await closeServer(server);
  }
});

test("normalizes raw AnyTLS links into a base64 subscription", () => {
  const raw =
    "anytls://password@example.com:443?sni=example.com&insecure=1#AnyTLS";
  const normalized = normalizeSubscriptionContent(raw);
  assert.notEqual(normalized, raw);
  assert.equal(Buffer.from(normalized, "base64").toString("utf8"), `${raw}\n`);
});

test("recognizes modern raw node-link subscriptions before conversion", () => {
  assert.equal(
    looksLikeSubscription(
      "tuic://00000000-0000-4000-8000-000000000003:password@example.com:443#TUIC",
    ),
    true,
  );
  assert.equal(
    looksLikeSubscription("hy2://password@example.com:443#Hysteria2"),
    true,
  );
  assert.equal(looksLikeSubscription(""), false);
});

test("recognizes a subscription that keeps its nodes in proxy-providers", () => {
  // No inline `proxies:` anywhere — the nodes are behind a second URL, which
  // the gateway follows before the engine sees anything.
  const providerBacked = `proxy-providers:
  airport:
    type: http
    url: https://upstream.example/nodes.yaml
rules:
  - MATCH,DIRECT
`;
  assert.equal(looksLikeSubscription(providerBacked), true);
});

test("cleans only orphaned conversion request directories", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ekko-convert-cleanup-"));
  const orphan = path.join(root, "123e4567-e89b-42d3-a456-426614174000");
  const unrelated = path.join(root, "keep-me");
  try {
    await mkdir(orphan);
    await writeFile(path.join(orphan, "subscription.input"), "secret");
    await mkdir(unrelated);
    await writeFile(path.join(unrelated, "marker"), "safe");

    assert.equal(await cleanupOrphanedConversionInputs(root), 1);
    await assert.rejects(readFile(path.join(orphan, "subscription.input")), {
      code: "ENOENT",
    });
    assert.equal(await readFile(path.join(unrelated, "marker"), "utf8"), "safe");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("maps client validation failures without hiding upstream failures", () => {
  assert.equal(publicErrorStatus("udp must be a boolean."), 400);
  assert.equal(
    publicErrorStatus("Profile name must be a string when provided."),
    400,
  );
  assert.equal(
    publicErrorStatus(
      "updateIntervalHours must be an integer from 1 to 168.",
    ),
    400,
  );
  assert.equal(publicErrorStatus("Access password required."), 401);
  assert.equal(
    publicErrorStatus("Subscription fetch failed with HTTP 500."),
    502,
  );
  // The shape of the visitor's subscription is theirs, not a gateway fault.
  assert.equal(
    publicErrorStatus(
      "This subscription keeps its nodes in proxy-providers, and none could be read (HTTP 403).",
    ),
    400,
  );
});

test("normalizes a mixed plaintext node list but leaves configs unchanged", () => {
  const links = [
    "ss://YWVzLTI1Ni1nY206cGFzc3dvcmQ@example.com:443#SS",
    "anytls://password@example.com:8443#AnyTLS",
  ].join("\n");
  assert.equal(
    Buffer.from(normalizeSubscriptionContent(links), "base64").toString("utf8"),
    `${links}\n`,
  );

  const yaml = "proxies:\n  - name: AnyTLS\n    type: anytls\n";
  assert.equal(normalizeSubscriptionContent(yaml), yaml);
});

test("drops a provider's traffic banner from a node list", () => {
  // What one provider actually answers to a Shadowrocket agent: a counter line
  // first, nodes after. The Mihomo bridge refuses the whole list over that one
  // line, and it reached the visitor as a 502.
  const banner =
    "STATUS=\u{1F680}↑:0.01GB,↓:5.98GB,TOT:100GB\u{1F4A1}Expires:2026-11-26";
  const nodes = [
    "anytls://password@example.com:443?sni=example.com&insecure=1#AnyTLS",
    "vmess://eyJ2IjoiMiIsInBzIjoiVk1lc3MifQ==",
  ];
  const encoded = Buffer.from(
    `${[banner, ...nodes].join("\r\n")}\r\n`,
    "utf8",
  ).toString("base64");

  assert.equal(
    Buffer.from(normalizeSubscriptionContent(encoded), "base64").toString(
      "utf8",
    ),
    `${nodes.join("\n")}\n`,
  );
  // The same list in the clear.
  assert.equal(
    Buffer.from(
      normalizeSubscriptionContent([banner, ...nodes].join("\n")),
      "base64",
    ).toString("utf8"),
    `${nodes.join("\n")}\n`,
  );
});

test("retains structured traffic metadata before removing a STATUS banner", () => {
  const status = "STATUS=🚀↑:0.01GB,↓:5.98GB,TOT:100GB💡Expires:2026-11-26";
  const list = Buffer.from(`${status}\nanytls://password@example.test:443#node\n`, "utf8").toString("base64");
  const expected = "upload=10737418; download=6420976108; total=107374182400; expire=1795651200";
  assert.equal(subscriptionUserinfoFromStatus(list), expected);
  assert.equal(subscriptionUserinfoFromStatus(`${status}\nanytls://password@example.test:443#node`), expected);
  assert.equal(subscriptionUserinfoFromStatus("proxies:\n  - name: node"), undefined);
  assert.equal(subscriptionUserinfoFromStatus("STATUS=Expires:invalid"), undefined);
});

test("leaves an already clean list, and anything unrecognised, byte-identical", () => {
  const clean = Buffer.from(
    "anytls://password@example.com:443#AnyTLS\nvmess://eyJ2IjoiMiJ9\n",
    "utf8",
  ).toString("base64");
  assert.equal(normalizeSubscriptionContent(clean), clean);

  // A line that is not a node but carries a URL means this is a format the
  // filter does not understand; half-rewriting it is worse than passing it on.
  const withUrlLine = [
    "# subscribe at https://provider.example/buy",
    "anytls://password@example.com:443#AnyTLS",
  ].join("\n");
  assert.equal(normalizeSubscriptionContent(withUrlLine), withUrlLine);

  const yaml = "proxies:\n  - name: AnyTLS\n    type: anytls\n";
  assert.equal(normalizeSubscriptionContent(yaml), yaml);
});

test("asks the provider the way the output reads when the caller is another family", () => {
  // Shadowrocket's native config is supplemented from a Mihomo node pass, so a
  // provider that switches format by agent still has to be asked as Mihomo.
  assert.equal(
    selectUpstreamUserAgent("shadowrocket", "", "Shadowrocket/2.2.70"),
    "clash.meta",
  );
  // The same mismatch through any other pairing: the file being built decides.
  assert.equal(
    selectUpstreamUserAgent("clash", "", "Shadowrocket/2.2.70"),
    "clash.meta",
  );
  assert.equal(selectUpstreamUserAgent("loon", "", "Stash/3.1"), "Loon");
  assert.equal(
    selectUpstreamUserAgent("singbox", "", "Shadowrocket/2.2.70"),
    "sing-box",
  );

  // Caller and output of one family: pass it on, so a provider that only
  // answers to clients it knows still sees one.
  assert.equal(
    selectUpstreamUserAgent("clash", "", "clash-verge-rev/2.4.3"),
    "clash-verge-rev/2.4.3",
  );
  assert.equal(
    selectUpstreamUserAgent("clash", "", "mihomo-party/1.7.3"),
    "mihomo-party/1.7.3",
  );
  assert.equal(
    selectUpstreamUserAgent("surge", "", "Surge iOS/2000"),
    "Surge iOS/2000",
  );
  assert.equal(
    selectUpstreamUserAgent("singbox", "", "SFI/1.11.3 (sing-box 1.11.3)"),
    "SFI/1.11.3 (sing-box 1.11.3)",
  );

  // An agent the user typed still wins over all of it.
  assert.equal(
    selectUpstreamUserAgent("shadowrocket", "MyAgent/1", "Shadowrocket/2.2.70"),
    "MyAgent/1",
  );
});

test("asks a second time as the target's own client when the first answer is unusable", () => {
  // One provider answers Stash with an error page and Mihomo with a node
  // list; another answers Shadowrocket with a legacy list where the native
  // renderer needs rich node fields. Both reached the visitor as a bare 502, so
  // a refused or unusable first answer is followed by one more question.
  assert.deepEqual(
    upstreamUserAgentAttempts("clash", "", "Stash/3.1.0 Clash/1.10.0"),
    ["Stash/3.1.0 Clash/1.10.0", "clash.meta"],
  );
  // Where the agent already follows the output, there is nothing to retry.
  assert.deepEqual(
    upstreamUserAgentAttempts("shadowrocket", "", "Shadowrocket/2.2.70"),
    ["clash.meta"],
  );
  assert.deepEqual(upstreamUserAgentAttempts("clash", "", "clash.meta"), [
    "clash.meta",
  ]);
  // An agent the person typed is used alone: overriding this is the point of
  // the field, and a silent second question would undo it.
  assert.deepEqual(
    upstreamUserAgentAttempts("clash", "MyAgent/1", "Stash/3.1.0"),
    ["MyAgent/1"],
  );
});

test("always tells the conversion engine whether node sorting is enabled", () => {
  const preserved = new URL("http://subconverter.test/sub");
  applyConvertOptions(preserved, DEFAULT_CONVERT_OPTIONS, "clash");
  assert.equal(preserved.searchParams.get("sort"), "false");

  const sorted = new URL("http://subconverter.test/sub");
  applyConvertOptions(
    sorted,
    { ...DEFAULT_CONVERT_OPTIONS, sort: true },
    "clash",
  );
  assert.equal(sorted.searchParams.get("sort"), "true");
});

test("inlines Mihomo provider nodes and rewires provider-backed groups", () => {
  const complete = [
    "port: 7890",
    "proxy-providers:",
    "  Local:",
    "    type: http",
    "    url: http://web:3000/sub/id/nodes",
    "proxy-groups:",
    "  - name: Select",
    "    type: select",
    "    use:",
    "      - Local",
    "    filter: .*",
    "    proxies:",
    "      - DIRECT",
    "rules:",
    "  - MATCH,Select",
    "",
  ].join("\n");
  const nodes = [
    "proxies:",
    "  - name: 03-Original-First",
    "    type: anytls",
    "    server: 203.0.113.1",
    "    port: 443",
    "  - name: 01-Original-Second",
    "    type: ss",
    "    server: 203.0.113.2",
    "    port: 8443",
    "  - name: 02-Original-Third",
    "    type: ss",
    "    server: 203.0.113.3",
    "    port: 9443",
    "",
  ].join("\n");

  const result = inlineMihomoProviderNodes(complete, nodes);
  assert.match(result, /^proxies:\n  - name: 03-Original-First/m);
  assert.ok(
    result.indexOf("03-Original-First") <
      result.indexOf("01-Original-Second"),
  );
  assert.ok(
    result.indexOf("01-Original-Second") <
      result.indexOf("02-Original-Third"),
  );
  const group = result.slice(
    result.indexOf("proxy-groups:"),
    result.indexOf("rules:"),
  );
  assert.ok(group.indexOf("DIRECT") < group.indexOf('"03-Original-First"'));
  assert.ok(
    group.indexOf('"03-Original-First"') <
      group.indexOf('"01-Original-Second"'),
  );
  assert.ok(
    group.indexOf('"01-Original-Second"') <
      group.indexOf('"02-Original-Third"'),
  );
  assert.doesNotMatch(
    result,
    /proxy-providers:|http:\/\/web:3000|^    use:|^    include-all:/m,
  );
  assert.match(result, /^rules:$/m);
});

test("rejects ambiguous Mihomo configs instead of adding a duplicate proxies key", () => {
  const complete = [
    "proxies:",
    "  - name: Existing",
    "    type: direct",
    "proxy-providers:",
    "  Local:",
    "    type: http",
    "proxy-groups:",
    "  - name: Select",
    "    type: select",
    "    use:",
    "      - Local",
    "rules:",
    "  - MATCH,Select",
    "",
  ].join("\n");
  const nodes = "proxies:\n  - name: New\n    type: direct\n";

  assert.throws(
    () => inlineMihomoProviderNodes(complete, nodes),
    /both inline and provider node sections/i,
  );
});
