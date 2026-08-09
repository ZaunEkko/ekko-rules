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

async function convert(target) {
  const response = await fetch(`${baseUrl}/api/convert`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ subscriptionUrl: fixtureUrl, target }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${target} conversion failed: HTTP ${response.status} ${text}`);
  const missing = targetMarkers[target].filter((marker) => !text.includes(marker));
  if (missing.length) throw new Error(`${target} output missing: ${missing.join(", ")}`);
  return text;
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
    "port: 7890",
    "enhanced-mode: fake-ip",
  ];
  const missing = required.filter((item) => !text.includes(item));
  if (missing.length) throw new Error(`profile output missing: ${missing.join(", ")}`);
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

  const capabilities = await fetch(`${baseUrl}/api/capabilities`).then((response) => response.json());
  if (capabilities.supported_targets.length !== Object.keys(targetMarkers).length) {
    throw new Error("capability target count does not match the E2E matrix.");
  }

  await assertModernProtocolLinks();
  await assertGatewayModernProtocolSubscriptions();

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
