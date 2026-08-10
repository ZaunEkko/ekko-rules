#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const selfhostRoot = path.resolve(__dirname, "..");
const outDir = path.join(selfhostRoot, ".e2e-output");
const outFile = path.join(outDir, "ekko-rules-clash.yaml");
const mihomo = process.env.MIHOMO_BIN || "C:/Program Files/TAG/mihomo-tag.exe";
const baseUrl = "http://127.0.0.1:8787";
const fixtureUrl = "http://fixture:8080/sanitized-subscription.yaml";
const composeEnv = {
  ...process.env,
  CONVERT_ALLOW_HOSTNAMES: "fixture",
};
const createdProfiles = new Map();

const modernLinks = [
  {
    protocol: "AnyTLS",
    type: "anytls",
    name: "fixture-anytls-link",
    url: "anytls://fixture-password@203.0.113.23:443?peer=fixture.example.test&insecure=1#fixture-anytls-link",
  },
  {
    protocol: "Hysteria2",
    type: "hysteria2",
    name: "fixture-hysteria2-link",
    url: "hysteria2://fixture-password@203.0.113.21:443?sni=fixture.example.test&insecure=1#fixture-hysteria2-link",
  },
  {
    protocol: "TUIC",
    type: "tuic",
    name: "fixture-tuic-link",
    url: "tuic://00000000-0000-4000-8000-000000000003:fixture-password@203.0.113.22:443?sni=fixture.example.test&congestion_control=bbr&udp_relay_mode=native&allow_insecure=1#fixture-tuic-link",
  },
  {
    protocol: "VLESS Reality",
    type: "vless",
    name: "fixture-vless-reality",
    url: "vless://00000000-0000-4000-8000-000000000002@203.0.113.20:443?encryption=none&flow=xtls-rprx-vision&security=reality&sni=fixture.example.test&fp=chrome&pbk=0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefg&sid=0123456789abcdef&type=tcp#fixture-vless-reality",
  },
];

const targetMarkers = {
  clash: ["proxies:", "proxy-groups:", "rules:"],
  singbox: ['"outbounds"', '"route"'],
  surge: ["[Proxy]", "[Proxy Group]", "[Rule]"],
  quanx: ["[server_local]", "[policy]", "[filter_local]"],
  loon: ["[Proxy]", "[Proxy Group]", "[Rule]"],
  surfboard: ["[Proxy]", "[Proxy Group]", "[Rule]"],
  quan: ["[SERVER]", "[POLICY]", "[TCP]"],
  mellow: ["[Endpoint]", "[EndpointGroup]", "[RoutingRule]"],
};

function run(command, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: opts.cwd || selfhostRoot,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      env: opts.env || process.env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) return resolve({ stdout, stderr });
      reject(new Error(`${command} ${args.join(" ")} failed (${code})\n${stderr || stdout}`));
    });
  });
}

async function waitForHealth(attempts = 90) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`, { cache: "no-store" });
      if (response.ok) {
        const body = await response.json();
        if (body.subconverter_reachable) return body;
      }
    } catch {
      // Container startup is intentionally polled.
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error("Health check did not become ready.");
}

async function assertJsonOnlyPostRoutes() {
  for (const route of ["/api/convert", "/api/profiles"]) {
    const response = await fetch(`${baseUrl}${route}`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "{}",
    });
    if (response.status !== 415) {
      throw new Error(
        `${route} accepted a non-JSON request with HTTP ${response.status}.`,
      );
    }
  }
  console.log(JSON.stringify({ phase: "json-content-type", rejected: true }));
}

async function convert(target, options) {
  const response = await fetch(`${baseUrl}/api/convert`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ subscriptionUrl: fixtureUrl, target, options }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${target} conversion failed: HTTP ${response.status} ${text}`);
  const missing = targetMarkers[target].filter((marker) => !text.includes(marker));
  if (missing.length) throw new Error(`${target} output missing: ${missing.join(", ")}`);
  return text;
}

async function assertOutputOptionTransforms() {
  const clash = await convert("clash", { xudp: true });
  const vmessLine = clash
    .split(/\r?\n/)
    .find((line) => line.includes("fixture-vmess"));
  if (!vmessLine || !/(?:xudp:\s*true|packet-encoding:\s*xudp)/.test(vmessLine)) {
    throw new Error("Mihomo XUDP override did not reach the VMess node.");
  }

  const singboxWithoutIpv6 = JSON.parse(
    await convert("singbox", { xudp: true, singboxIpv6: false }),
  );
  const vmess = singboxWithoutIpv6.outbounds.find(
    (outbound) => outbound.type === "vmess",
  );
  if (vmess?.packet_encoding !== "xudp") {
    throw new Error("sing-box XUDP override did not reach the VMess outbound.");
  }
  const withoutIpv6Text = JSON.stringify(singboxWithoutIpv6);
  if (/inet6_|"AAAA"/.test(withoutIpv6Text)) {
    throw new Error("sing-box IPv6 fields remained while IPv6 was disabled.");
  }

  const singboxWithIpv6 = JSON.parse(
    await convert("singbox", { singboxIpv6: true }),
  );
  const withIpv6Text = JSON.stringify(singboxWithIpv6);
  if (!/inet6_/.test(withIpv6Text) || !/"AAAA"/.test(withIpv6Text)) {
    throw new Error("sing-box IPv6 fields were not preserved when enabled.");
  }
  console.log(JSON.stringify({
    phase: "output-options",
    mihomo_xudp: true,
    singbox_xudp: true,
    singbox_ipv6_toggle: true,
  }));
}

function clashProxyNames(output) {
  const lines = output.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((line) => line === "proxies:");
  const end = lines.findIndex(
    (line, index) => index > start && /^proxy-groups:\s*$/.test(line),
  );
  if (start < 0 || end < 0) return [];
  return lines.slice(start + 1, end).flatMap((line) => {
    const flow = line.match(
      /^\s*-\s*\{name:\s*(?:"([^"]*)"|'([^']*)'|([^,}]+))/,
    );
    const block = line.match(
      /^\s*-\s*name:\s*(?:"([^"]*)"|'([^']*)'|(.+))$/,
    );
    const match = flow || block;
    return match ? [(match[1] || match[2] || match[3] || "").trim()] : [];
  });
}

function clashGroupProxyNames(output, groupName) {
  const lines = output.replace(/\r\n/g, "\n").split("\n");
  const groupStart = lines.findIndex(
    (line) => line === `  - name: ${groupName}`,
  );
  if (groupStart < 0) return [];
  const groupEnd = lines.findIndex(
    (line, index) => index > groupStart && /^  - name:\s*/.test(line),
  );
  const block = lines.slice(groupStart, groupEnd < 0 ? lines.length : groupEnd);
  const proxiesStart = block.findIndex((line) => /^    proxies:\s*$/.test(line));
  if (proxiesStart < 0) return [];
  return block.slice(proxiesStart + 1).flatMap((line) => {
    const match = line.match(/^      -\s*(.+)$/);
    if (!match) return [];
    const value = match[1].trim();
    if (value.startsWith('"')) {
      try {
        return [JSON.parse(value)];
      } catch {
        return [value];
      }
    }
    return [value.startsWith("'") && value.endsWith("'")
      ? value.slice(1, -1).replace(/''/g, "'")
      : value];
  });
}

async function assertDefaultNodeOrderAndEmoji() {
  const output = await convert("clash");
  const names = clashProxyNames(output);
  const expected = [
    "🇭🇰 香港 fixture-ss",
    "fixture-vmess",
    "fixture-anytls",
    "🇹🇼 fixture-Taiwan Taipei",
    "🇧🇭 fixture-Bahrain Manama",
    "🇧🇾 fixture-Belarus Minsk",
    "🇬🇬 fixture-Guernsey 3x GG",
    "🇮🇴 fixture-British Indian Ocean Territory 3x IO",
  ];
  if (JSON.stringify(names) !== JSON.stringify(expected)) {
    throw new Error(
      `default conversion changed node order or missed emoji: ${JSON.stringify(names)}`,
    );
  }
  const manualGroup = clashGroupProxyNames(output, "♻️ 手动切换");
  const expectedGroup = ["DIRECT", ...expected];
  if (JSON.stringify(manualGroup) !== JSON.stringify(expectedGroup)) {
    throw new Error(
      `manual group changed node order: ${JSON.stringify(manualGroup)}`,
    );
  }
  if (/^\s+include-all:\s*true\s*$/m.test(output)) {
    throw new Error("Mihomo groups still rely on unordered include-all expansion.");
  }
  console.log(JSON.stringify({
    phase: "node-order-emoji",
    preserved: true,
    supplemented: true,
    nodes: names.length,
  }));
}

async function assertModernProtocolLinks() {
  for (const fixture of modernLinks) {
    for (const target of ["clash", "singbox"]) {
      const endpoint = `http://127.0.0.1:25500/sub?target=${target}&list=true&config=config%2Fekko-rules-selfhost.ini&url=${encodeURIComponent(fixture.url)}`;
      const { stdout } = await run(
        "docker",
        ["compose", "exec", "-T", "subconverter", "wget", "-qO-", endpoint],
        { env: composeEnv },
      );
      const typeMarker = target === "clash"
        ? `type: ${fixture.type}`
        : `"type":"${fixture.type}"`;
      if (!stdout.includes(typeMarker) || !stdout.includes(fixture.name)) {
        throw new Error(
          `${fixture.protocol} was not retained in ${target} output.`,
        );
      }
      console.log(JSON.stringify({
        phase: "protocol",
        protocol: fixture.protocol,
        target,
        retained: true,
      }));
    }
  }
}

async function assertGatewayModernProtocolSubscriptions() {
  const fixtures = [
    {
      protocol: "TUIC",
      url: "http://fixture:8080/tuic-subscription.txt",
      markers: ["type: tuic", "fixture-tuic-http"],
    },
    {
      protocol: "Hy2 alias",
      url: "http://fixture:8080/hy2-subscription.txt",
      markers: ["type: hysteria2", "fixture-hy2-http"],
    },
  ];

  for (const fixture of fixtures) {
    const response = await fetch(`${baseUrl}/api/convert`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subscriptionUrl: fixture.url, target: "clash" }),
    });
    const output = await response.text();
    if (!response.ok) {
      throw new Error(
        `${fixture.protocol} gateway conversion failed: HTTP ${response.status} ${output}`,
      );
    }
    const missing = fixture.markers.filter((marker) => !output.includes(marker));
    if (missing.length) {
      throw new Error(
        `${fixture.protocol} gateway output missing: ${missing.join(", ")}`,
      );
    }
    console.log(JSON.stringify({
      phase: "gateway-protocol",
      protocol: fixture.protocol,
      retained: true,
    }));
  }
}

async function createProfile(autoUpdate, updateIntervalHours, name) {
  const response = await fetch(`${baseUrl}/api/profiles`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name,
      subscriptionUrl: fixtureUrl,
      target: "clash",
      options: {
        autoUpdate,
        emoji: true,
        udp: true,
        xudp: true,
        tfo: true,
        skipCertVerify: true,
        tls13: true,
        sort: true,
        filterUnsupported: true,
        appendType: true,
        include: "fixture",
        exclude: "vmess",
        rename: "fixture@Lab",
        customUserAgent: "",
        updateIntervalHours,
        singboxIpv6: false,
      },
    }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`profile creation failed: HTTP ${response.status} ${text}`);
  const profile = JSON.parse(text).profile;
  createdProfiles.set(profile.id, profile);
  return profile;
}

async function fetchProfile(profile, autoUpdate, updateIntervalHours) {
  const response = await fetch(`${baseUrl}${profile.subscriptionPath}`, {
    cache: "no-store",
    headers: { "user-agent": "clash-verge-rev/e2e" },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`profile fetch failed: HTTP ${response.status} ${text}`);
  const required = [
    "proxies:",
    "type: anytls",
    "Lab-anytls",
    "udp: true",
    "skip-cert-verify: true",
    "🇭🇰",
    "proxy-groups:",
    "rules:",
    "MATCH,🐟 漏网之鱼",
    "☁️ 国内云服务",
    "☁️ 海外云服务",
    "DOMAIN-SUFFIX,gov.cn,🌏 国内网站",
    "DOMAIN-SUFFIX,cn,🌏 国内网站",
    "port: 7890",
    "enhanced-mode: fake-ip",
  ];
  const missing = required.filter((item) => !text.includes(item));
  if (missing.length) throw new Error(`profile output missing: ${missing.join(", ")}`);
  if (
    text.indexOf("DOMAIN-SUFFIX,gov.cn,🌏 国内网站") >
    text.indexOf("MATCH,🐟 漏网之鱼")
  ) {
    throw new Error("China domain fallback appears after the final catch-all rule.");
  }
  if (text.includes("proxy-providers:") || text.includes("0.0.0.0:3000")) {
    throw new Error("profile output still delegates nodes to an internal provider URL.");
  }
  if (text.includes("fixture-vmess")) {
    throw new Error("profile exclude filter did not remove fixture-vmess.");
  }
  if (text.includes(fixtureUrl)) {
    throw new Error("profile output leaked the real subscription URL.");
  }
  const profileTitle = response.headers.get("profile-title");
  if (
    !profileTitle?.startsWith("base64:") ||
    Buffer.from(profileTitle.slice("base64:".length), "base64").toString("utf8") !==
      profile.name
  ) {
    throw new Error("profile title header does not preserve the chosen name.");
  }
  const disposition = response.headers.get("content-disposition");
  if (!disposition?.includes("filename=")) {
    throw new Error("profile filename response header is missing.");
  }
  const intervalHeader = response.headers.get("profile-update-interval");
  if (!autoUpdate && intervalHeader !== null) {
    throw new Error("disabled profile unexpectedly advertises auto-update.");
  }
  if (
    autoUpdate &&
    intervalHeader !== String(updateIntervalHours)
  ) {
    throw new Error("enabled profile update interval header is missing.");
  }
  if (
    response.headers.get("subscription-userinfo") !==
    "upload=512; download=2048; total=10737418240; expire=1798761600"
  ) {
    throw new Error("upstream subscription usage metadata was not forwarded.");
  }
  return text;
}

async function deleteProfile(profile, allowMissing = false) {
  const response = await fetch(
    `${baseUrl}/api/profiles/${encodeURIComponent(profile.id)}`,
    { method: "DELETE" },
  );
  if (response.status !== 204 && !(allowMissing && response.status === 404)) {
    throw new Error("E2E profile cleanup failed.");
  }
  createdProfiles.delete(profile.id);
}

async function restoreNormalStack() {
  console.log(JSON.stringify({ phase: "restore-normal-stack" }));
  const cleanupErrors = [];
  try {
    await run(
      "docker",
      ["compose", "--profile", "e2e", "down"],
      { env: composeEnv },
    );
  } catch (error) {
    cleanupErrors.push(error);
    try {
      await run(
        "docker",
        ["compose", "--profile", "e2e", "rm", "-sf", "fixture"],
        { env: composeEnv },
      );
    } catch (fallbackError) {
      cleanupErrors.push(fallbackError);
    }
  }
  await run(
    "docker",
    ["compose", "up", "-d", "--remove-orphans"],
    { env: process.env },
  );
  await waitForHealth();
  for (const profile of [...createdProfiles.values()]) {
    try {
      await deleteProfile(profile, true);
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (cleanupErrors.length) {
    throw new AggregateError(cleanupErrors, "E2E cleanup did not fully complete.");
  }
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  console.log(JSON.stringify({ phase: "compose-up", cwd: selfhostRoot }));
  await run(
    "docker",
    ["compose", "--profile", "e2e", "up", "--build", "-d", "--remove-orphans"],
    { env: composeEnv },
  );

  const health = await waitForHealth();
  console.log(JSON.stringify({ phase: "health", health }));
  await assertJsonOnlyPostRoutes();

  const capabilities = await fetch(`${baseUrl}/api/capabilities`).then((response) => response.json());
  if (capabilities.supported_targets.length !== Object.keys(targetMarkers).length) {
    throw new Error("capability target count does not match the E2E matrix.");
  }

  await assertModernProtocolLinks();
  await assertGatewayModernProtocolSubscriptions();
  await assertDefaultNodeOrderAndEmoji();
  await assertOutputOptionTransforms();

  const formatResults = {};
  for (const target of Object.keys(targetMarkers)) {
    const output = await convert(target);
    formatResults[target] = Buffer.byteLength(output, "utf8");
  }
  console.log(JSON.stringify({ phase: "formats", bytes: formatResults }));

  const profile = await createProfile(false, 24, "E2E manual-update profile");
  const firstOutput = await fetchProfile(profile, false, 24);
  writeFileSync(outFile, firstOutput, "utf8");

  console.log(JSON.stringify({ phase: "mihomo-test", bin: mihomo, file: outFile }));
  const mihomoResult = await run(mihomo, ["-t", "-f", outFile]);
  console.log(mihomoResult.stdout || mihomoResult.stderr);

  console.log(JSON.stringify({ phase: "compose-restart", profile: profile.subscriptionPath }));
  await run("docker", ["compose", "--profile", "e2e", "down"], { env: composeEnv });
  await run("docker", ["compose", "--profile", "e2e", "up", "-d"], { env: composeEnv });
  await waitForHealth();
  const restartedOutput = await fetchProfile(profile, false, 24);
  if (restartedOutput !== firstOutput) {
    throw new Error("profile output changed across a normal Compose restart.");
  }

  const scheduledProfile = await createProfile(
    true,
    12,
    "E2E scheduled profile",
  );
  await fetchProfile(scheduledProfile, true, 12);

  await deleteProfile(profile);
  await deleteProfile(scheduledProfile);

  console.log(JSON.stringify({
    phase: "done",
    output: outFile,
    bytes: Buffer.byteLength(firstOutput, "utf8"),
    restart_safe: true,
    real_source_hidden: true,
    advanced_options_verified: true,
    inline_nodes_verified: true,
    profile_name_headers_verified: true,
    subscription_userinfo_verified: true,
    manual_update_only_verified: true,
    scheduled_update_verified: true,
    modern_protocols: modernLinks.map((item) => item.protocol),
    complete_targets: Object.keys(targetMarkers),
  }, null, 2));
}

async function runSuite() {
  let suiteError;
  try {
    await main();
  } catch (error) {
    suiteError = error;
    console.error(error.stack || String(error));
    try {
      const logs = await run(
        "docker",
        ["compose", "--profile", "e2e", "logs", "--no-color"],
        { env: composeEnv },
      );
      console.error(logs.stdout || logs.stderr);
    } catch {
      // Ignore log collection failures and continue with stack restoration.
    }
  }

  try {
    await restoreNormalStack();
  } catch (error) {
    console.error(error.stack || String(error));
    if (!suiteError) suiteError = error;
  }

  if (suiteError) throw suiteError;
}

try {
  await runSuite();
} catch {
  process.exitCode = 1;
}
