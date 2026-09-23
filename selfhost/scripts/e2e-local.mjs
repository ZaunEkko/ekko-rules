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
const invalidAdvertisedBaseUrl = "http://copy-only.invalid/ignored-path";
const composeEnv = {
  ...process.env,
  CONVERT_ALLOW_HOSTNAMES: "fixture",
  LAN_BASE_URL: invalidAdvertisedBaseUrl,
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
  shadowrocket: ["[Proxy]", "[Proxy Group]", "[Rule]"],
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

async function assertShadowrocketNativeOutput() {
  const response = await fetch(`${baseUrl}/api/convert`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      subscriptionUrl:
        "http://fixture:8080/shadowrocket-modern-subscription.txt",
      target: "shadowrocket",
    }),
  });
  const output = await response.text();
  if (!response.ok) {
    throw new Error(
      `Shadowrocket native conversion failed: HTTP ${response.status} ${output}`,
    );
  }

  const required = [
    "fixture-anytls-link = anytls",
    "fixture-hysteria2-link = hysteria2",
    "fixture-tuic-link = tuic",
    "fixture-vless-reality = vless",
    "pbk=0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefg",
    "♻️ 手动切换 = select,DIRECT",
    "policy-select-name=DIRECT",
    "🛑 广告拦截 = select,REJECT,♻️ 手动切换,DIRECT",
    "🔞 NSFW = select,REJECT,♻️ 手动切换,DIRECT",
    "policy-select-name=REJECT",
    "🧲 OpenAI = select,♻️ 手动切换,DIRECT",
    "policy-select-name=♻️ 手动切换",
  ];
  const missing = required.filter((marker) => !output.includes(marker));
  if (missing.length) {
    throw new Error(
      `Shadowrocket native output missing: ${missing.join(", ")}`,
    );
  }
  if (/^DIRECT\s*=\s*direct\s*$/m.test(output) || /^proxies:\s*$/m.test(output)) {
    throw new Error("Shadowrocket output still contains the lossy Clash shape.");
  }
  if (/^♻️ 手动切换 = .*\bhidden=/m.test(output)) {
    throw new Error("Shadowrocket manual selector is still marked hidden.");
  }
  const groupSection = output.match(
    /^\[Proxy Group\]\s*$([\s\S]*?)^\[[^\]]+\]\s*$/m,
  )?.[1];
  const groupCount = groupSection
    ? groupSection
        .split(/\r?\n/)
        .filter((line) => /^[^#;\s].*?\s*=/.test(line)).length
    : 0;
  if (groupCount !== 44) {
    throw new Error(
      `Shadowrocket complete config expected 44 policy groups, got ${groupCount}.`,
    );
  }
  console.log(JSON.stringify({
    phase: "shadowrocket-native",
    special_policies: true,
    nested_groups: true,
    policy_groups: groupCount,
    modern_nodes: modernLinks.map((item) => item.protocol),
  }));
}

async function assertShadowrocketAllModernManualSelector() {
  const response = await fetch(`${baseUrl}/api/convert`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      subscriptionUrl:
        "http://fixture:8080/shadowrocket-modern-subscription.txt",
      target: "shadowrocket",
    }),
  });
  const output = await response.text();
  if (!response.ok) {
    throw new Error(
      `Shadowrocket all-modern conversion failed: HTTP ${response.status} ${output}`,
    );
  }
  if (/^♻️ 手动切换\s*=\s*direct$/m.test(output)) {
    throw new Error("Shadowrocket manual selector collapsed into a direct proxy.");
  }
  if (!/^♻️ 手动切换 = select,DIRECT,.*policy-select-name=DIRECT$/m.test(output)) {
    throw new Error("Shadowrocket manual selector was not restored as a group.");
  }
}

async function checkShadowrocketYamlDocument(config, name, mode) {
  const configFile = path.join(outDir, `${name}-${mode}.yaml`);
  writeFileSync(configFile, config);
  const { stdout } = await run(process.env.PYTHON_BIN || "python", [
    path.join(__dirname, "check-shadowrocket-import.py"),
    mode, configFile,
  ]);
  await run(mihomo, ["-t", "-f", configFile]);
  return JSON.parse(stdout);
}

function assertNativeShadowrocketPolicyChoices(config, label) {
  const required = [
    /^♻️ 手动切换 = select,DIRECT,/m,
    /^🛑 广告拦截 = select,REJECT,/m,
    /^🔞 NSFW = select,REJECT,/m,
  ];
  if (required.some((pattern) => !pattern.test(config))) {
    throw new Error(`${label} lost DIRECT or REJECT policy choices.`);
  }
}

async function assertNamedShadowrocketImportRoute() {
  const query = new URLSearchParams({
    url: "http://fixture:8080/shadowrocket-modern-subscription.txt",
    target: "shadowrocket",
    name: "fixture-shadowrocket",
  }).toString();
  const packed = Buffer.from(query, "utf8").toString("base64url");
  const path = `/i/fixture-shadowrocket.conf?p=${packed}`;

  const clientResponse = await fetch(`${baseUrl}${path}`, {
    headers: { "user-agent": "Shadowrocket/2.2.70" },
  });
  const config = await clientResponse.text();
  if (
    !clientResponse.ok ||
    !config.includes("[Proxy Group]") ||
    !config.includes("♻️ 手动切换 = select,DIRECT") ||
    clientResponse.headers.get("subscription-userinfo") !==
      "upload=512; download=1024; total=10737418240; expire=1798761600" ||
    /^♻️ 手动切换 = .*\bhidden=/m.test(config)
  ) {
    throw new Error(
      `Named Shadowrocket import route did not return a complete config: HTTP ${clientResponse.status}`,
    );
  }
  assertNativeShadowrocketPolicyChoices(config, "Named Shadowrocket config route");

  console.log(JSON.stringify({
    phase: "shadowrocket-native-compat",
    path,
    client_config: true,
  }));

  const homeQuery = new URLSearchParams(query);
  homeQuery.set("target", "clash");
  const homePacked = Buffer.from(homeQuery.toString(), "utf8").toString("base64url");
  const homePath = `/i/fixture-shadowrocket.yaml?srhome=1&p=${homePacked}&remark=fixture-shadowrocket`;
  const homeResponse = await fetch(`${baseUrl}${homePath}`, {
    headers: { "user-agent": "Shadowrocket/2.2.70" },
  });
  const homeYaml = await homeResponse.text();
  for (const marker of [
    "proxies:",
    "fixture-anytls-link",
    "fixture-hysteria2-link",
    "fixture-tuic-link",
    "fixture-vless-reality",
  ]) {
    if (!homeYaml.includes(marker)) throw new Error(`Shadowrocket home response lacks ${marker}`);
  }
  if (homeYaml.includes("proxy-providers:") || /^proxies: \[\]$/m.test(homeYaml)) {
    throw new Error("Shadowrocket home response must carry inline nodes without a provider dependency.");
  }
  const homeStructure = await checkShadowrocketYamlDocument(
    homeYaml, "fixture-shadowrocket", "home",
  );
  if (!homeResponse.ok ||
      homeResponse.headers.get("subscription-userinfo") !==
        "upload=512; download=1024; total=10737418240; expire=1798761600" ||
      homeResponse.headers.get("profile-title") !==
        `base64:${Buffer.from("fixture-shadowrocket").toString("base64")}`) {
    throw new Error("Shadowrocket home response lost nodes, name or usage metadata.");
  }

  const configPath = `/i/fixture-shadowrocket.yaml?srconfig=1&p=${homePacked}&remark=fixture-shadowrocket`;
  const configResponse = await fetch(`${baseUrl}${configPath}`, {
    headers: { "user-agent": "Shadowrocket/2.2.70" },
  });
  const configYaml = await configResponse.text();
  if (!configResponse.ok || !configYaml.includes("[Proxy Group]")) {
    throw new Error("Legacy Shadowrocket config address did not upgrade to a native config.");
  }
  assertNativeShadowrocketPolicyChoices(configYaml, "Legacy Shadowrocket config route");
  if (configResponse.headers.get("subscription-userinfo") !==
        "upload=512; download=1024; total=10737418240; expire=1798761600" ||
      configResponse.headers.get("profile-title") !==
        `base64:${Buffer.from("fixture-shadowrocket").toString("base64")}` ||
      !configResponse.headers.get("content-disposition")?.includes('filename="fixture-shadowrocket"')) {
    throw new Error("Shadowrocket config address lost its chosen name or usage metadata.");
  }
  // Node's fetch owns Sec-Fetch-Mode and overrides a forged navigation value.
  const { stdout: page } = await run("curl.exe", [
    "-fsS",
    "-H", "Sec-Fetch-Mode: navigate",
    "-H", "Sec-Fetch-Dest: document",
    "-H", "Accept: text/html",
    "-H", "User-Agent: Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
    `${baseUrl}${homePath}`,
  ]);
  if (!page.includes("shadowrocket://add/") ||
      !page.includes("fixture-shadowrocket.yaml") || page.includes("config/add")) {
    throw new Error("System camera did not preserve the Shadowrocket Home subscription bridge.");
  }
  const { stdout: configPage } = await run("curl.exe", [
    "-fsS",
    "-H", "Sec-Fetch-Mode: navigate",
    "-H", "Sec-Fetch-Dest: document",
    "-H", "Accept: text/html",
    "-H", "User-Agent: Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
    `${baseUrl}${path}`,
  ]);
  if (!configPage.includes("shadowrocket://config/add/") ||
      !configPage.includes("fixture-shadowrocket.conf") || configPage.includes("shadowrocket://add/")) {
    throw new Error("System camera did not preserve the Shadowrocket Configuration bridge.");
  }
  console.log(JSON.stringify({ phase: "shadowrocket-home-inline-import", ...homeStructure, local_nodes: homeStructure.nodes, named_provider: false, dependency_depth: 0, selectable_direct_reject: false, metadata: true, home_browser_bridge: true }));
  console.log(JSON.stringify({ phase: "shadowrocket-config-native-import", native_config: true, selectable_direct_reject: true, metadata: true }));
}

async function assertStoredShadowrocketHomeRoute() {
  const created = await fetch(`${baseUrl}/api/profiles`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      subscriptionUrl: "http://fixture:8080/shadowrocket-modern-subscription.txt",
      target: "shadowrocket",
      name: "stored-shadowrocket",
    }),
  });
  if (!created.ok) throw new Error(`Stored Shadowrocket profile failed: HTTP ${created.status}`);
  const { profile } = await created.json();
  createdProfiles.set(profile.id, profile);
  const storedHomeUrl = `${baseUrl}${profile.subscriptionPath}/stored-shadowrocket.yaml?srhome=1`;
  const homeResponse = await fetch(storedHomeUrl, {
    headers: { "user-agent": "Shadowrocket/2.2.70" },
  });
  const homeBody = await homeResponse.text();
  if (!homeResponse.ok || homeBody.includes("proxy-providers:") || /^proxies: \[\]$/m.test(homeBody) ||
      !homeBody.includes("fixture-anytls-link") || !homeBody.includes("fixture-vless-reality") ||
      homeResponse.headers.get("subscription-userinfo") !==
        "upload=512; download=1024; total=10737418240; expire=1798761600") {
    throw new Error(`Stored Shadowrocket home URL lost inline nodes or traffic info: HTTP ${homeResponse.status}`);
  }
  const homeStructure = await checkShadowrocketYamlDocument(
    homeBody, "stored-shadowrocket", "home",
  );

  const storedConfigUrl = `${baseUrl}${profile.subscriptionPath}/stored-shadowrocket.conf`;
  const configResponse = await fetch(storedConfigUrl, {
    headers: { "user-agent": "Shadowrocket/2.2.70" },
  });
  const configBody = await configResponse.text();
  if (!configResponse.ok || !configBody.includes("[Proxy Group]")) {
    throw new Error(`Stored Shadowrocket config-page URL did not return a native config: HTTP ${configResponse.status}`);
  }
  assertNativeShadowrocketPolicyChoices(configBody, "Stored Shadowrocket config route");
  if (configResponse.headers.get("profile-title") !==
        `base64:${Buffer.from("stored-shadowrocket").toString("base64")}` ||
      configResponse.headers.get("subscription-userinfo") !==
        "upload=512; download=1024; total=10737418240; expire=1798761600") {
    throw new Error("Stored Shadowrocket config lost its chosen name or usage metadata.");
  }
  await deleteProfile(profile);
  console.log(JSON.stringify({ phase: "shadowrocket-stored-home-inline", ...homeStructure, local_nodes: homeStructure.nodes, named_provider: false, dependency_depth: 0, selectable_direct_reject: false, metadata: true }));
  console.log(JSON.stringify({ phase: "shadowrocket-stored-config-native", native_config: true, selectable_direct_reject: true, metadata: true }));
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
    // A provider's traffic counter sitting in the node list. The Mihomo bridge
    // refuses the whole list over that line, so the gateway drops it on the
    // way in; the pair without the banner is the control.
    {
      protocol: "Traffic banner",
      url: "http://fixture:8080/status-banner-subscription.txt",
      markers: ["type: anytls", "fixture-anytls-link", "fixture-anytls-2"],
    },
    {
      protocol: "Banner-free control",
      url: "http://fixture:8080/anytls-pair-subscription.txt",
      markers: ["type: anytls", "fixture-anytls-link", "fixture-anytls-2"],
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

/**
 * A provider that answers by who is asking: an error page for a client it does
 * not serve, a node list for Mihomo. The gateway has to ask a second time as
 * the client its own output is written for — and the list it then gets carries
 * the account's traffic counter as its first line, which the Mihomo bridge
 * refuses unless the gateway drops it.
 */
async function assertUserAgentFallback() {
  const response = await fetch(`${baseUrl}/api/convert`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // The agent of a client this provider refuses.
      "user-agent": "Stash/3.1.0 Clash/1.10.0",
    },
    body: JSON.stringify({
      subscriptionUrl: "http://fixture:8080/ua-gated-subscription.txt",
      target: "clash",
    }),
  });
  const output = await response.text();
  if (!response.ok) {
    throw new Error(
      `user-agent fallback conversion failed: HTTP ${response.status} ${output}`,
    );
  }
  for (const marker of ["type: anytls", "fixture-anytls-link", "proxy-groups:"]) {
    if (!output.includes(marker)) {
      throw new Error(`user-agent fallback output missing: ${marker}`);
    }
  }
  console.log(JSON.stringify({ phase: "user-agent-fallback", recovered: true }));
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
    "DOMAIN-SUFFIX,edu.cn,🌏 国内网站",
    "DOMAIN-SUFFIX,ac.cn,🌏 国内网站",
    "DOMAIN-SUFFIX,mil.cn,🌏 国内网站",
    "port: 7890",
    "allow-lan: false",
    "bind-address: 127.0.0.1",
    "listen: 127.0.0.1:53",
    "enhanced-mode: fake-ip",
    "geosite:gfw",
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
  if (
    health.status !== "ok" ||
    health.subscription_base_url !== null ||
    !health.subscription_base_url_error
  ) {
    throw new Error(
      "An invalid UI export prefix degraded the backend or was not ignored.",
    );
  }
  console.log(JSON.stringify({
    phase: "display-prefix-isolation",
    advertised: invalidAdvertisedBaseUrl,
    reachable: baseUrl,
    backend_ready: true,
  }));
  await assertJsonOnlyPostRoutes();

  const capabilities = await fetch(`${baseUrl}/api/capabilities`).then((response) => response.json());
  if (capabilities.supported_targets.length !== Object.keys(targetMarkers).length) {
    throw new Error("capability target count does not match the E2E matrix.");
  }

  await assertModernProtocolLinks();
  await assertShadowrocketNativeOutput();
  await assertShadowrocketAllModernManualSelector();
  await assertNamedShadowrocketImportRoute();
  await assertStoredShadowrocketHomeRoute();
  await assertGatewayModernProtocolSubscriptions();
  await assertUserAgentFallback();
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
    display_prefix_isolated: true,
    modern_protocols: modernLinks.map((item) => item.protocol),
    user_agent_fallback_verified: true,
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
