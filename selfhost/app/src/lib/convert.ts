import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readdir, writeFile, rm } from "node:fs/promises";
import * as http from "node:http";
import * as https from "node:https";
import { isIP, type LookupFunction } from "node:net";
import path from "node:path";
import { assertPublicHostname, parsePublicHttpUrl, redactUrl } from "./ssrf";
import {
  isSupportedTarget,
  targetDefinition,
  type TargetFormat,
} from "./capabilities";
import {
  DEFAULT_CONVERT_OPTIONS,
  parseConvertOptions,
  type ConvertOptions,
} from "./options";

export type ConvertRequest = {
  subscriptionUrl: string;
  target: TargetFormat;
  options: ConvertOptions;
  accessPassword?: string;
};

export type ConvertResult = {
  filename: string;
  contentType: string;
  body: string;
  bytes: number;
  target: TargetFormat;
  requestId: string;
  subscriptionUserinfo?: string;
};

const SUBSCRIPTION_USERINFO_FIELDS = [
  "upload",
  "download",
  "total",
  "expire",
] as const;

export function sanitizeSubscriptionUserinfo(
  value: string | null,
): string | undefined {
  if (!value) return undefined;

  const fields = new Map<string, string>();
  for (const part of value.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const key = part.slice(0, separator).trim().toLowerCase();
    const fieldValue = part.slice(separator + 1).trim();
    if (
      SUBSCRIPTION_USERINFO_FIELDS.includes(
        key as (typeof SUBSCRIPTION_USERINFO_FIELDS)[number],
      ) &&
      /^\d{1,20}$/.test(fieldValue)
    ) {
      fields.set(key, fieldValue);
    }
  }

  const normalized = SUBSCRIPTION_USERINFO_FIELDS.flatMap((key) => {
    const fieldValue = fields.get(key);
    return fieldValue === undefined ? [] : [`${key}=${fieldValue}`];
  });
  return normalized.length ? normalized.join("; ") : undefined;
}

export function sanitizeSourceUserAgent(
  value: string | null | undefined,
): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 256 || /[\u0000-\u001f\u007f]/.test(trimmed)) {
    return undefined;
  }
  return trimmed;
}

const DEFAULT_UPSTREAM_USER_AGENTS: Record<TargetFormat, string> = {
  clash: "clash.meta",
  singbox: "sing-box",
  surge: "Surge",
  quanx: "Quantumult X",
  loon: "Loon",
  surfboard: "Surfboard",
  quan: "Quantumult",
  mellow: "Mellow",
};

export function selectUpstreamUserAgent(
  target: TargetFormat,
  customValue: string | null | undefined,
  sourceValue: string | null | undefined,
): string {
  const custom = sanitizeSourceUserAgent(customValue);
  if (custom) return custom;
  const source = sanitizeSourceUserAgent(sourceValue);
  if (source && !/^Mozilla\/5\.0\b/i.test(source)) return source;
  return DEFAULT_UPSTREAM_USER_AGENTS[target];
}

export function isLoopbackBindHost(host: string): boolean {
  const normalized = host.trim().replace(/^\[|\]$/g, "").toLowerCase();
  return normalized === "127.0.0.1" || normalized === "::1" || normalized === "localhost";
}

export function normalizeSubscriptionBaseUrl(raw: string | undefined): {
  value: string;
  error: string;
} {
  const value = raw?.trim() || "";
  if (!value) return { value: "", error: "" };
  try {
    const parsed = new URL(value);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.username ||
      parsed.password ||
      (parsed.pathname !== "/" && parsed.pathname !== "") ||
      parsed.search ||
      parsed.hash
    ) {
      throw new Error("invalid base URL");
    }
    return { value: parsed.origin, error: "" };
  } catch {
    return {
      value: "",
      error: "LAN_BASE_URL must be an http(s) origin without a path or credentials.",
    };
  }
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function requiredEnv(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
}

export function getRuntimeConfig() {
  const accessPassword = process.env.ACCESS_PASSWORD?.trim() || "";
  const webBindHost = requiredEnv("WEB_BIND_HOST", "0.0.0.0");
  const lanAccessEnabled = !isLoopbackBindHost(webBindHost);
  const subscriptionBaseUrl = normalizeSubscriptionBaseUrl(
    process.env.LAN_BASE_URL,
  );
  const configurationErrors = [subscriptionBaseUrl.error].filter(Boolean);
  return {
    subconverterBaseUrl: requiredEnv(
      "SUBCONVERTER_BASE_URL",
      "http://127.0.0.1:25500",
    ).replace(/\/$/, ""),
    ekkoRulesVersion: requiredEnv("EKKO_RULES_VERSION", "local"),
    subconverterVersion: requiredEnv(
      "SUBCONVERTER_VERSION",
      "v1.3.0",
    ),
    timeoutMs: envInt("CONVERT_TIMEOUT_MS", 30_000),
    maxSubscriptionBytes: envInt("MAX_SUBSCRIPTION_BYTES", 5_242_880),
    accessPassword,
    webBindHost,
    webPort: envInt("WEB_PORT", 8787),
    lanAccessEnabled,
    subscriptionBaseUrl: subscriptionBaseUrl.value,
    hostNetworkInfoPath: requiredEnv(
      "HOST_NETWORK_INFO_PATH",
      "/host-runtime/lan-address.json",
    ),
    configurationError: configurationErrors.join(" "),
    fixedConfigPath: "config/ekko-rules-selfhost.ini",
    // Gateway stores short-lived inputs here for its internal HTTP handoff route.
    sharedDir: requiredEnv("CONVERT_SHARED_DIR", "/shared"),
    sharedUrlPrefix: requiredEnv("CONVERT_SHARED_URL_PREFIX", "file:///shared"),
  };
}

export function authorizeLocalAccess(provided?: string): void {
  const runtime = getRuntimeConfig();
  const expected = runtime.accessPassword;
  if (runtime.configurationError) {
    throw new Error(runtime.configurationError);
  }
  if (!expected) return;
  const providedDigest = createHash("sha256").update(provided ?? "").digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  if (!provided || !timingSafeEqual(providedDigest, expectedDigest)) {
    throw new Error("Access password required.");
  }
}

export function isJsonRequestContentType(value: string | null): boolean {
  const mediaType = (value ?? "").split(";", 1)[0].trim().toLowerCase();
  return (
    mediaType === "application/json" ||
    /^application\/[a-z0-9!#$&^_.+-]+\+json$/.test(mediaType)
  );
}

export function parseConvertRequest(input: unknown): ConvertRequest {
  if (!input || typeof input !== "object") {
    throw new Error("Request body must be a JSON object.");
  }
  const body = input as Record<string, unknown>;
  const subscriptionUrl = body.subscriptionUrl;
  const target = body.target;
  const convertOptions = parseConvertOptions(body.options);
  const accessPassword = body.accessPassword;

  if (typeof subscriptionUrl !== "string" || !subscriptionUrl.trim()) {
    throw new Error("subscriptionUrl is required.");
  }
  if (typeof target !== "string" || !isSupportedTarget(target)) {
    throw new Error("A supported target is required.");
  }
  if (accessPassword !== undefined && typeof accessPassword !== "string") {
    throw new Error("accessPassword must be a string when provided.");
  }

  return {
    subscriptionUrl: subscriptionUrl.trim(),
    target,
    options: convertOptions,
    accessPassword,
  };
}

type LimitedTextResponse = {
  ok: boolean;
  status: number;
  headers: Headers;
  body: string;
};

type LimitedRequestOptions = {
  method?: string;
  timeoutMs: number;
  maxBytes: number;
  userAgent?: string;
  requestLabel?: string;
  headers?: Record<string, string>;
  resolvedAddresses?: readonly string[];
};

function createPinnedLookup(addresses: readonly string[]): LookupFunction {
  const records = addresses
    .map((address) => ({ address, family: isIP(address) }))
    .filter(
      (record): record is { address: string; family: 4 | 6 } =>
        record.family === 4 || record.family === 6,
    )
    .sort((left, right) => left.family - right.family);
  if (!records.length) {
    throw new Error("Subscription host has no usable address.");
  }

  return (_hostname, options, callback) => {
    const requestedFamily =
      options.family === "IPv4"
        ? 4
        : options.family === "IPv6"
          ? 6
          : options.family;
    const candidates =
      requestedFamily === 4 || requestedFamily === 6
        ? records.filter((record) => record.family === requestedFamily)
        : records;
    if (!candidates.length) {
      const error = new Error(
        "Subscription host has no address in the requested family.",
      ) as NodeJS.ErrnoException;
      error.code = "ENOTFOUND";
      callback(error, "", 0);
      return;
    }
    if (options.all) {
      callback(null, candidates);
      return;
    }
    callback(null, candidates[0].address, candidates[0].family);
  };
}

function responseHeaders(headers: http.IncomingHttpHeaders): Headers {
  const result = new Headers();
  for (const [name, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      for (const item of value) result.append(name, item);
    } else if (value !== undefined) {
      result.set(name, value);
    }
  }
  return result;
}

function publicRequestError(label: string, error: unknown): Error {
  if (
    error instanceof Error &&
    (error.message === "Upstream response exceeds size limit." ||
      error.message === `${label} timed out.`)
  ) {
    return error;
  }
  const cause =
    error instanceof Error && error.cause && typeof error.cause === "object"
      ? (error.cause as { code?: unknown })
      : error && typeof error === "object"
        ? (error as { code?: unknown })
        : undefined;
  const code = typeof cause?.code === "string" ? ` (${cause.code})` : "";
  return new Error(`${label} failed${code}.`, { cause: error });
}

export async function requestTextWithLimits(
  url: string,
  init: LimitedRequestOptions,
): Promise<LimitedTextResponse> {
  const endpoint = new URL(url);
  if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") {
    throw new Error("Only http and https requests are supported.");
  }
  const label = init.requestLabel || "HTTP request";
  const transport = endpoint.protocol === "https:" ? https : http;
  const lookup = init.resolvedAddresses
    ? createPinnedLookup(init.resolvedAddresses)
    : undefined;

  return new Promise<LimitedTextResponse>((resolve, reject) => {
    let settled = false;
    let timer: NodeJS.Timeout;
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      action();
    };
    const fail = (error: unknown) => {
      finish(() => reject(publicRequestError(label, error)));
    };

    const request = transport.request(
      endpoint,
      {
        method: init.method || "GET",
        headers: {
          "user-agent": init.userAgent || "ekko-rules-selfhost/0.1",
          accept: "*/*",
          "accept-encoding": "identity",
          ...(init.headers || {}),
        },
        lookup,
      },
      (response) => {
        const chunks: Buffer[] = [];
        let total = 0;
        response.on("data", (chunk: Buffer) => {
          total += chunk.byteLength;
          if (total > init.maxBytes) {
            const error = new Error("Upstream response exceeds size limit.");
            response.destroy(error);
            request.destroy(error);
            return;
          }
          chunks.push(chunk);
        });
        response.once("aborted", () => fail(new Error("Response aborted.")));
        response.once("error", fail);
        response.once("end", () => {
          const status = response.statusCode || 0;
          finish(() =>
            resolve({
              ok: status >= 200 && status < 300,
              status,
              headers: responseHeaders(response.headers),
              body: Buffer.concat(chunks).toString("utf8"),
            }),
          );
        });
      },
    );
    request.once("error", fail);
    timer = setTimeout(() => {
      request.destroy(new Error(`${label} timed out.`));
    }, init.timeoutMs);
    request.end();
  });
}

const NODE_LINK_PATTERN =
  /^(ss|ssr|vmess|vless|trojan|hysteria2?|hy2|tuic|anytls):\/\//i;

export function looksLikeSubscription(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return false;
  if (trimmed.includes("proxies:") || trimmed.includes("Proxy,")) return true;
  // base64-ish subscription dumps
  if (/^[A-Za-z0-9+/=\r\n]+$/.test(trimmed) && trimmed.length > 32) return true;
  if (
    trimmed
      .split(/\r?\n/)
      .some((line) => NODE_LINK_PATTERN.test(line.trim()))
  ) {
    return true;
  }
  return false;
}

export function normalizeSubscriptionContent(content: string): string {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length > 0 && lines.every((line) => NODE_LINK_PATTERN.test(line))) {
    return Buffer.from(`${lines.join("\n")}\n`, "utf8").toString("base64");
  }
  return content;
}

const CONVERSION_WORK_DIR_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function cleanupOrphanedConversionInputs(
  sharedDir = getRuntimeConfig().sharedDir,
): Promise<number> {
  let entries;
  try {
    entries = await readdir(sharedDir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw error;
  }

  const orphanedDirectories = entries.filter(
    (entry) =>
      entry.isDirectory() && CONVERSION_WORK_DIR_PATTERN.test(entry.name),
  );
  await Promise.all(
    orphanedDirectories.map((entry) =>
      rm(path.join(sharedDir, entry.name), { recursive: true, force: true }),
    ),
  );
  return orphanedDirectories.length;
}

function topLevelSectionEnd(lines: string[], start: number): number {
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^[A-Za-z][A-Za-z0-9-]*:\s*/.test(lines[index])) return index;
  }
  return lines.length;
}

export function inlineMihomoProviderNodes(
  completeConfig: string,
  providerNodes: string,
): string {
  const completeLines = completeConfig.replace(/\r\n/g, "\n").split("\n");
  const nodeLines = providerNodes.replace(/\r\n/g, "\n").split("\n");
  const providerStart = completeLines.findIndex((line) =>
    /^proxy-providers:\s*$/.test(line),
  );
  const existingProxies = completeLines.some((line) => /^proxies:\s*$/.test(line));
  if (providerStart < 0) {
    if (existingProxies) return completeConfig;
    throw new Error("Complete Mihomo config contains no node section.");
  }
  if (existingProxies) {
    throw new Error(
      "Complete Mihomo config contains both inline and provider node sections.",
    );
  }

  const nodesStart = nodeLines.findIndex((line) => /^proxies:\s*$/.test(line));
  if (nodesStart < 0) {
    throw new Error("Mihomo node conversion contains no proxies.");
  }
  const nodesEnd = topLevelSectionEnd(nodeLines, nodesStart);
  const replacement = nodeLines.slice(nodesStart, nodesEnd);
  while (replacement.length > 1 && replacement.at(-1) === "") replacement.pop();

  const providerEnd = topLevelSectionEnd(completeLines, providerStart);
  completeLines.splice(providerStart, providerEnd - providerStart, ...replacement);

  const inlined: string[] = [];
  for (let index = 0; index < completeLines.length; index += 1) {
    const line = completeLines[index];
    const useMatch = line.match(/^(\s+)use:\s*$/);
    if (!useMatch) {
      inlined.push(line);
      continue;
    }

    const indent = useMatch[1];
    inlined.push(`${indent}include-all: true`);
    while (index + 1 < completeLines.length) {
      const next = completeLines[index + 1];
      if (!next.trim()) {
        index += 1;
        continue;
      }
      const nextIndent = next.match(/^\s*/)?.[0].length ?? 0;
      if (nextIndent <= indent.length) break;
      index += 1;
    }
  }

  return `${inlined.join("\n").replace(/\n+$/, "")}\n`;
}

export async function convertSubscription(
  request: ConvertRequest,
  options: {
    authorize?: boolean;
    outputMode?: "complete" | "clash-provider-nodes";
    sourceUserAgent?: string | null;
  } = {},
): Promise<ConvertResult> {
  const runtime = getRuntimeConfig();
  if (options.authorize !== false) {
    authorizeLocalAccess(request.accessPassword);
  }
  const definition = targetDefinition(request.target);
  const outputMode = options.outputMode ?? "complete";
  const convertOptions = request.options ?? DEFAULT_CONVERT_OPTIONS;
  const upstreamUserAgent = selectUpstreamUserAgent(
    request.target,
    convertOptions.customUserAgent,
    options.sourceUserAgent,
  );

  if (outputMode === "clash-provider-nodes" && request.target !== "clash") {
    throw new Error("Node provider output is only available for Mihomo.");
  }

  const safeUrl = parsePublicHttpUrl(request.subscriptionUrl);
  const resolvedAddresses = await assertPublicHostname(safeUrl.hostname);

  const preflight = await requestTextWithLimits(safeUrl.href, {
    method: "GET",
    timeoutMs: runtime.timeoutMs,
    maxBytes: runtime.maxSubscriptionBytes,
    userAgent: upstreamUserAgent,
    requestLabel: "Subscription fetch",
    resolvedAddresses,
  });
  if (!preflight.ok) {
    throw new Error(`Subscription fetch failed with HTTP ${preflight.status}.`);
  }
  const subscriptionUserinfo = sanitizeSubscriptionUserinfo(
    preflight.headers.get("subscription-userinfo"),
  );
  const subscriptionBody = preflight.body;
  if (!looksLikeSubscription(subscriptionBody)) {
    throw new Error("Subscription content is empty or unsupported.");
  }

  const requestId = randomUUID();
  const workDir = path.join(runtime.sharedDir, requestId);
  const inputName = "subscription.input";
  const inputPath = path.join(workDir, inputName);
  const engineInputUrl = `${runtime.sharedUrlPrefix.replace(/\/$/, "")}/${requestId}/${inputName}`;

  await mkdir(workDir, { recursive: true, mode: 0o700 });
  try {
    await writeFile(inputPath, normalizeSubscriptionContent(subscriptionBody), {
      encoding: "utf8",
      mode: 0o600,
    });

    const endpoint = new URL("/sub", `${runtime.subconverterBaseUrl}/`);
    endpoint.searchParams.set("target", definition.engineTarget);
    for (const [name, value] of Object.entries(definition.engineParams)) {
      endpoint.searchParams.set(name, value);
    }
    endpoint.searchParams.set("url", engineInputUrl);
    endpoint.searchParams.set("config", runtime.fixedConfigPath);
    endpoint.searchParams.set("emoji", String(convertOptions.emoji));
    endpoint.searchParams.set(
      "list",
      outputMode === "clash-provider-nodes" ? "true" : "false",
    );
    endpoint.searchParams.set("expand", "true");
    applyConvertOptions(endpoint, convertOptions, request.target);

    const converted = await requestTextWithLimits(endpoint.toString(), {
      method: "GET",
      timeoutMs: runtime.timeoutMs,
      maxBytes: runtime.maxSubscriptionBytes * 4,
      requestLabel: "Complete conversion",
      headers: request.target === "clash" ? { "user-agent": "clash.meta" } : {},
    });
    if (!converted.ok) {
      throw new Error(`Conversion failed with HTTP ${converted.status}.`);
    }

    let body = converted.body;
    if (
      request.target === "clash" &&
      outputMode === "complete" &&
      body.includes("proxy-providers:")
    ) {
      const nodeEndpoint = new URL(endpoint);
      nodeEndpoint.searchParams.set("list", "true");
      const nodeResponse = await requestTextWithLimits(nodeEndpoint.toString(), {
        method: "GET",
        timeoutMs: runtime.timeoutMs,
        maxBytes: runtime.maxSubscriptionBytes * 4,
        requestLabel: "Node conversion",
        headers: { "user-agent": "clash.meta" },
      });
      if (!nodeResponse.ok) {
        throw new Error(`Node conversion failed with HTTP ${nodeResponse.status}.`);
      }
      const nodeBody = nodeResponse.body;
      body = inlineMihomoProviderNodes(body, nodeBody);
    }
    assertConvertedBody(body, request.target, outputMode);

    return {
      filename:
        outputMode === "clash-provider-nodes"
          ? "ekko-rules-provider.yaml"
          : `ekko-rules-${request.target}.${definition.extension}`,
      contentType:
        outputMode === "clash-provider-nodes"
          ? "text/yaml; charset=utf-8"
          : definition.contentType,
      body,
      bytes: Buffer.byteLength(body, "utf8"),
      target: request.target,
      requestId,
      subscriptionUserinfo,
    };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

function applyConvertOptions(
  endpoint: URL,
  options: ConvertOptions,
  target: TargetFormat,
): void {
  const enabledSwitches: Array<[boolean, string]> = [
    [options.udp, "udp"],
    [options.tfo, "tfo"],
    [options.skipCertVerify, "scv"],
    [options.tls13, "tls13"],
    [options.sort, "sort"],
    [options.filterUnsupported, "fdn"],
    [options.appendType, "append_type"],
  ];
  for (const [enabled, name] of enabledSwitches) {
    if (enabled) endpoint.searchParams.set(name, "true");
  }
  if (options.include) endpoint.searchParams.set("include", options.include);
  if (options.exclude) endpoint.searchParams.set("exclude", options.exclude);
  if (options.rename) endpoint.searchParams.set("rename", options.rename);
  if (target === "singbox" && options.singboxIpv6) {
    endpoint.searchParams.set("singbox.ipv6", "1");
  }
}

function assertConvertedBody(
  body: string,
  target: TargetFormat,
  outputMode: "complete" | "clash-provider-nodes",
): void {
  if (!body.trim()) {
    throw new Error("Conversion result is empty.");
  }

  if (outputMode === "clash-provider-nodes") {
    if (!body.includes("proxies:")) {
      throw new Error("Conversion result is not a Mihomo provider node list.");
    }
    return;
  }

  if (target === "clash") {
    if (
      !body.includes("proxies:") ||
      body.includes("proxy-providers:") ||
      !body.includes("proxy-groups:") ||
      !body.includes("rules:")
    ) {
      throw new Error("Conversion result is not a complete Mihomo config.");
    }
    return;
  }

  if (target === "singbox") {
    try {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      if (!Array.isArray(parsed.outbounds) || !parsed.route) {
        throw new Error("missing sing-box sections");
      }
    } catch {
      throw new Error("Conversion result is not a complete sing-box config.");
    }
    return;
  }

  const markers: Record<Exclude<TargetFormat, "clash" | "singbox">, string[]> = {
    surge: ["[Proxy]", "[Proxy Group]", "[Rule]"],
    quanx: ["[server_local]", "[policy]", "[filter_local]"],
    loon: ["[Proxy]", "[Proxy Group]", "[Rule]"],
    surfboard: ["[Proxy]", "[Proxy Group]", "[Rule]"],
    quan: ["[SERVER]", "[POLICY]", "[TCP]"],
    mellow: ["[Endpoint]", "[EndpointGroup]", "[RoutingRule]"],
  };
  if (!markers[target].every((marker) => body.includes(marker))) {
    throw new Error(
      `Conversion result is not a complete ${targetDefinition(target).label} config.`,
    );
  }
}

export function publicErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message;
    if (/abort|AbortError/i.test(message)) {
      return "Conversion timed out.";
    }
    return message;
  }
  return "Conversion failed.";
}

export function publicErrorStatus(message: string): number {
  if (/password/i.test(message)) return 401;
  if (/^LAN_BASE_URL\b/i.test(message)) return 500;
  if (
    /^(?:Request body|subscriptionUrl|A supported target|accessPassword|options|autoUpdate|emoji|udp|tfo|skipCertVerify|tls13|sort|filterUnsupported|appendType|singboxIpv6|include|exclude|rename|customUserAgent|updateIntervalHours|Profile name)\b/i.test(
      message,
    ) ||
    /^(?:Invalid subscription URL|Only http and https subscription URLs|Subscription URLs must not include credentials|Subscription URL is too long|Subscription host (?:is not allowed|resolves to a blocked address)|Encoded hostnames are not allowed|Subscription content is empty or unsupported|Node provider output is only available)/i.test(
      message,
    )
  ) {
    return 400;
  }
  return 502;
}

export function safeLog(event: string, detail?: Record<string, unknown>) {
  const payload: Record<string, unknown> = {
    event,
    ts: new Date().toISOString(),
    ...(detail ?? {}),
  };
  if (typeof payload.subscriptionUrl === "string") {
    payload.subscriptionUrl = redactUrl(payload.subscriptionUrl);
  }
  console.info(JSON.stringify(payload));
}
