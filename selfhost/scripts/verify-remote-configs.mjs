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
  // The same Mihomo file, installed through Shadowrocket's configuration
  // entry: a third-party rule config has to produce it just as completely.
  shadowrocket: ["proxies:", "proxy-groups:", "rules:"],
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
    (target === "clash" || target === "shadowrocket") &&
    body.includes("proxy-providers:")
  ) {
    throw new Error(`${label}: output still delegates nodes to a provider`);
  }
  if (!body.includes("fixture")) {
    throw new Error(`${label}: output contains none of the fixture nodes`);
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

async function verifyTargetCoverage(configId) {
  for (const target of Object.keys(TARGET_MARKERS)) {
    const result = await convert({ target, config: configId });
    if (result.status !== 200) {
      throw new Error(`${configId} + ${target}: HTTP ${result.status} ${result.body.slice(0, 200)}`);
    }
    assertComplete(result.body, target, `${configId} + ${target}`);
    console.log(JSON.stringify({ phase: "target", config: configId, target, bytes: result.body.length }));
  }
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
  // Every client format must survive a third-party config, not just Mihomo.
  const thirdParty = presets.find((preset) => !preset.builtin);
  if (thirdParty) await verifyTargetCoverage(thirdParty.id);
  if (capabilities.allow_custom_remote_config) {
    const pasted = await convert({
      target: "clash",
      config: "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/config/ACL4SSR_Online_Mini.ini",
    });
    if (pasted.status !== 200) {
      throw new Error(`pasted config URL failed: HTTP ${pasted.status}`);
    }
    assertComplete(pasted.body, "clash", "pasted config URL");
    console.log(JSON.stringify({ phase: "custom-url", status: 200 }));
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
