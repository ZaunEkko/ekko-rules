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
  ConfigurationError,
  getRuntimeConfig,
  inlineMihomoProviderNodes,
  isJsonRequestContentType,
  looksLikeSubscription,
  normalizeSubscriptionContent,
  publicErrorStatus,
  sanitizeSourceUserAgent,
  sanitizeSubscriptionUserinfo,
  selectUpstreamUserAgent,
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
    assert.equal(getRuntimeConfig().configurationError, "");
    assert.doesNotThrow(() => authorizeLocalAccess());

    process.env.ACCESS_PASSWORD = "lan-secret";
    assert.equal(getRuntimeConfig().configurationError, "");
    assert.doesNotThrow(() => authorizeLocalAccess("lan-secret"));
    assert.throws(() => authorizeLocalAccess("wrong"), /password/i);
  } finally {
    if (previousBindHost === undefined) delete process.env.WEB_BIND_HOST;
    else process.env.WEB_BIND_HOST = previousBindHost;
    if (previousPassword === undefined) delete process.env.ACCESS_PASSWORD;
    else process.env.ACCESS_PASSWORD = previousPassword;
  }
});

test("throws a tagged error for invalid runtime configuration", () => {
  const previousBaseUrl = process.env.LAN_BASE_URL;
  try {
    process.env.LAN_BASE_URL = "http://lan.example.test/with-path";
    assert.throws(() => authorizeLocalAccess(), ConfigurationError);
  } finally {
    if (previousBaseUrl === undefined) delete process.env.LAN_BASE_URL;
    else process.env.LAN_BASE_URL = previousBaseUrl;
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
    publicErrorStatus(
      new ConfigurationError(
        "LAN_BASE_URL must be an http(s) origin without a path or credentials.",
      ),
    ),
    500,
  );
  assert.equal(
    publicErrorStatus("Subscription fetch failed with HTTP 500."),
    502,
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
