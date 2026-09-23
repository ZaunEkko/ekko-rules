#!/usr/bin/env node
// Pre-flight for an open (stateless) deployment.
//
// Runs the stack in SELFHOST_MODE=public and verifies every offered remote
// config against the real engine, that the stored-profile surface is gone, and
// that the engine handoff route is unreachable from outside. Unlike
// scripts/e2e-local.mjs this reaches the public internet: each preset is
// fetched from its own project's servers.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const selfhostRoot = path.resolve(__dirname, "..");
const baseUrl = process.env.VERIFY_BASE_URL || "http://127.0.0.1:8787";
const fixtureUrl = "http://fixture:8080/sanitized-subscription.yaml";
// The open deployment is the one these presets are for, so verify in it.
const composeEnv = {
  ...process.env,
  CONVERT_ALLOW_HOSTNAMES: "fixture",
  SELFHOST_MODE: "public",
  PUBLIC_BASE_URL: baseUrl,
};

const TARGET_MARKERS = {
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

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: selfhostRoot,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      env: composeEnv,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve({ stdout, stderr })
        : reject(new Error(`${command} ${args.join(" ")} failed (${code})\n${stderr || stdout}`)),
    );
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

function statelessUrl(params) {
  const query = new URLSearchParams({ url: fixtureUrl, ...params });
  return `${baseUrl}/sub?${query.toString()}`;
}

async function convert(params) {
  const started = Date.now();
  const response = await fetch(statelessUrl(params), { cache: "no-store" });
  const body = await response.text();
  return { status: response.status, body, ms: Date.now() - started };
}

function assertComplete(body, target, label) {
  const missing = TARGET_MARKERS[target].filter((marker) => !body.includes(marker));
  if (missing.length) {
    throw new Error(`${label}: output is missing ${missing.join(", ")}`);
  }
  if (
    target === "clash" &&
    body.includes("proxy-providers:")
  ) {
    throw new Error(`${label}: output still delegates nodes to a provider`);
  }
  if (target === "shadowrocket") {
    if (
      !body.includes("policy-select-name=") ||
      !body.includes("PROXY uses its selected node") ||
      body.includes("include-all-proxies=") ||
      !body.includes(",fixture-vmess,") ||
      !/^.*=\s*[a-z][a-z-]*,.*(?:^|,)PROXY(?:,|$)/m.test(body) ||
      /^proxies:\s*$/m.test(body) ||
      /^DIRECT\s*=\s*direct\s*$/m.test(body)
    ) {
      throw new Error(
        `${label}: native Shadowrocket structure is incomplete`,
      );
    }
  }
  if (target !== "shadowrocket" && !body.includes("fixture")) {
    throw new Error(`${label}: output contains none of the fixture nodes`);
  }
}

function shadowrocketGroupLines(body) {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const start = lines.indexOf("[Proxy Group]");
  const end = lines.indexOf("[Rule]");
  if (start < 0 || end <= start) return [];
  return lines
    .slice(start + 1, end)
    .map((line) => line.trim())
    .filter(Boolean);
}

function assertEkkoShadowrocketPolicies(body, configId) {
  const shared = [
    "♻️ 手动切换 = select,PROXY,DIRECT",
    "🛑 广告拦截 = select,REJECT,♻️ 手动切换,DIRECT",
    "🔞 NSFW = select,REJECT,♻️ 手动切换,DIRECT",
    "🌏 国内网站 = select,DIRECT,♻️ 手动切换",
  ];
  const liteOnly = [
    "🧲 海外 AI = select,♻️ 手动切换,DIRECT",
    "🎮 游戏平台 = select,♻️ 手动切换,DIRECT",
    "🎮 游戏下载 = select,DIRECT,♻️ 手动切换",
    "🎬 流媒体 = select,♻️ 手动切换,DIRECT",
    "🚀 国外服务 = select,♻️ 手动切换,DIRECT",
    "🐟 漏网之鱼 = select,♻️ 手动切换,DIRECT",
  ];
  const expected = configId === "ekko-lite" ? [...shared, ...liteOnly] : shared;
  const missing = expected.filter((marker) => !body.includes(marker));
  if (missing.length) {
    throw new Error(
      `${configId}: native Shadowrocket defaults are incomplete: ${missing.join(", ")}`,
    );
  }
  if (configId === "ekko-lite") {
    const groups = shadowrocketGroupLines(body);
    if (groups.length !== 10) {
      throw new Error(
        `ekko-lite: expected 10 native Shadowrocket groups, got ${groups.length}`,
      );
    }
  }
}

async function verifyPresets(presets) {
  const results = [];
  for (const preset of presets) {
    const result = await convert({ target: "clash", config: preset.id });
    if (result.status !== 200) {
      throw new Error(`${preset.id}: HTTP ${result.status} ${result.body.slice(0, 200)}`);
    }
    assertComplete(result.body, "clash", preset.id);
    results.push({
      id: preset.id,
      label: preset.label,
      bytes: Buffer.byteLength(result.body, "utf8"),
      ms: result.ms,
    });
    console.log(JSON.stringify({ phase: "preset", ...results.at(-1) }));
  }
  return results;
}

async function verifyTargetCoverage(configId, targets = Object.keys(TARGET_MARKERS)) {
  for (const target of targets) {
    const result = await convert({ target, config: configId });
    if (result.status !== 200) {
      throw new Error(`${configId} + ${target}: HTTP ${result.status} ${result.body.slice(0, 200)}`);
    }
    assertComplete(result.body, target, `${configId} + ${target}`);
    console.log(JSON.stringify({ phase: "target", config: configId, target, bytes: result.body.length }));
  }
}

async function verifyEkkoShadowrocket(configId) {
  const result = await convert({ target: "shadowrocket", config: configId });
  if (result.status !== 200) {
    throw new Error(
      `${configId} + shadowrocket: HTTP ${result.status} ${result.body.slice(0, 200)}`,
    );
  }
  assertComplete(result.body, "shadowrocket", `${configId} + shadowrocket`);
  assertEkkoShadowrocketPolicies(result.body, configId);
  console.log(JSON.stringify({
    phase: "ekko-shadowrocket",
    config: configId,
    groups: shadowrocketGroupLines(result.body).length,
    nsfw_default: "REJECT",
    bytes: result.body.length,
  }));
}

async function verifyStatelessSurface() {
  for (const route of [
    "/api/profiles",
    "/sub/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    "/sub/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/nodes",
    // The engine handoff route must only answer inside the Compose network.
    "/api/internal/input/00000000-0000-4000-8000-000000000000/subscription.input",
  ]) {
    const response = await fetch(`${baseUrl}${route}`, { cache: "no-store" });
    if (response.status !== 404) {
      throw new Error(`${route} should not exist here: HTTP ${response.status}`);
    }
    console.log(JSON.stringify({ phase: "absent", route, status: 404 }));
  }
}

async function verifyRejections() {
  const cases = [
    { name: "cloud metadata", config: "https://169.254.169.254/latest/meta-data/" },
    { name: "loopback engine", config: "https://127.0.0.1:25500/version" },
    { name: "private address", config: "https://10.0.0.1/config.ini" },
    { name: "cleartext http", config: "http://example.com/config.ini" },
    { name: "unlisted id", config: "definitely-not-a-preset" },
  ];
  for (const item of cases) {
    const result = await convert({ target: "clash", config: item.config });
    if (result.status !== 400) {
      throw new Error(`${item.name} was not rejected: HTTP ${result.status}`);
    }
    console.log(JSON.stringify({ phase: "rejected", case: item.name, status: result.status }));
  }
}

async function main() {
  console.log(JSON.stringify({ phase: "compose-up" }));
  await run("docker", ["compose", "--profile", "e2e", "up", "--build", "-d", "--remove-orphans"]);
  await waitForHealth();

  const response = await fetch(`${baseUrl}/api/capabilities`, { cache: "no-store" });
  if (!response.ok) throw new Error(`capabilities failed: HTTP ${response.status}`);
  const capabilities = await response.json();
  if (capabilities.stores_profiles !== false) {
    throw new Error("Verification must run against an open, stateless deployment.");
  }
  const presets = capabilities.remote_configs || [];
  if (!presets.length || presets[0].id !== "ekko" || !presets[0].builtin) {
    throw new Error("Ekko Rules must be the first and built-in remote config.");
  }

  const results = await verifyPresets(presets);
  await verifyEkkoShadowrocket("ekko");
  await verifyEkkoShadowrocket("ekko-lite");
  // A third-party policy dialect must survive the same native Shadowrocket
  // assembly as the built-in configs, while keeping coverage for every other
  // client family.
  const thirdParty = presets.filter((preset) => !preset.builtin);
  if (thirdParty.length) {
    // One representative still exercises the full target matrix. Every
    // offered third-party preset then gets its own native Shadowrocket pass,
    // so a single incompatible ACL4SSR variant cannot hide behind that sample.
    await verifyTargetCoverage(thirdParty[0].id);
    for (const preset of thirdParty.slice(1)) {
      await verifyTargetCoverage(preset.id, ["shadowrocket"]);
    }
  }
  if (capabilities.allow_custom_remote_config) {
    const customConfig = "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/config/ACL4SSR_Online_Mini.ini";
    for (const target of ["clash", "shadowrocket"]) {
      const pasted = await convert({ target, config: customConfig });
      if (pasted.status !== 200) {
        throw new Error(
          `pasted config URL + ${target} failed: HTTP ${pasted.status}`,
        );
      }
      assertComplete(pasted.body, target, `pasted config URL + ${target}`);
      console.log(JSON.stringify({ phase: "custom-url", target, status: 200 }));
    }
  }
  await verifyRejections();
  await verifyStatelessSurface();

  console.log(JSON.stringify({ phase: "done", presets: results.length, results }, null, 2));
}

try {
  await main();
} catch (error) {
  console.error(error.stack || String(error));
  process.exitCode = 1;
} finally {
  try {
    await run("docker", ["compose", "--profile", "e2e", "rm", "-sf", "fixture"]);
  } catch {
    // The fixture is only used by verification runs.
  }
}
