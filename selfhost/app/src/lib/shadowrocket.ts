type FlowValue = string | FlowMap | FlowValue[];
interface FlowMap {
  [key: string]: FlowValue;
}

// These mappings are deliberately isolated here: their structure is covered
// by tests, while live connectivity for every modern protocol remains a device
// acceptance item rather than a capability claim in the UI.
const NATIVE_OPTION_PREFIX = /^(?:url|interval|timeout|tolerance|evaluate-before-use|policy-select-name|policy-path|policy-regex-filter|no-alert|hidden|include-other-group|include-all-proxies|filter|update-interval)=/i;
const MANUAL_SELECTOR = "♻️ 手动切换";

function splitTopLevel(value: string, delimiter = ","): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  let quote: "\"" | "'" | null = null;
  let escaped = false;

  for (const character of value) {
    if (quote) {
      current += character;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (quote === "\"" && character === "\\") {
        escaped = true;
        continue;
      }
      if (character === quote) quote = null;
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
      current += character;
      continue;
    }
    if (character === "{" || character === "[") depth += 1;
    if (character === "}" || character === "]") depth -= 1;
    if (character === delimiter && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }
  if (quote || depth !== 0) {
    throw new Error("Malformed Mihomo flow-style proxy entry.");
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
    try {
      return JSON.parse(trimmed) as string;
    } catch {
      throw new Error("Malformed quoted Mihomo proxy value.");
    }
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  return trimmed;
}

function parseFlowValue(value: string): FlowValue {
  const trimmed = value.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return parseFlowMap(trimmed);
  }
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return splitTopLevel(trimmed.slice(1, -1)).map(parseFlowValue);
  }
  return unquote(trimmed);
}

function parseFlowMap(value: string): FlowMap {
  const inner = value.trim().replace(/^\{/, "").replace(/\}$/, "");
  const result: FlowMap = {};
  for (const field of splitTopLevel(inner)) {
    const separator = field.indexOf(":");
    if (separator < 1) {
      throw new Error("Malformed Mihomo proxy field.");
    }
    const key = unquote(field.slice(0, separator));
    result[key] = parseFlowValue(field.slice(separator + 1));
  }
  return result;
}

function scalar(node: FlowMap, key: string): string | undefined {
  const value = node[key];
  return typeof value === "string" && value !== "" ? value : undefined;
}

function nested(node: FlowMap, key: string): FlowMap | undefined {
  const value = node[key];
  return value && !Array.isArray(value) && typeof value === "object"
    ? value
    : undefined;
}

function scalarList(node: FlowMap, key: string): string[] {
  const value = node[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function parseMihomoFlowProxies(body: string): FlowMap[] {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((line) => /^proxies:\s*$/.test(line));
  if (start < 0) {
    throw new Error("Shadowrocket node conversion contains no proxies.");
  }

  const nodes: FlowMap[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^[A-Za-z][A-Za-z0-9-]*:/.test(line)) break;
    if (/^\s*-\s+name\s*:/i.test(line)) {
      throw new Error(
        "Shadowrocket node conversion unexpectedly used block-style YAML.",
      );
    }
    const match = line.match(/^\s*-\s*(\{.*\})\s*$/);
    if (!match) continue;
    const node = parseFlowMap(match[1]);
    if (scalar(node, "name")) nodes.push(node);
  }
  if (!nodes.length) {
    throw new Error("Shadowrocket node conversion contains no named proxies.");
  }
  return nodes;
}

function nativeValue(value: string, label: string): string {
  if (!value || /[\r\n,]/.test(value)) {
    throw new Error(`Shadowrocket ${label} contains an unsupported delimiter.`);
  }
  return value;
}

function nodeName(node: FlowMap): string {
  const name = scalar(node, "name");
  if (!name || /[\r\n,=]/.test(name)) {
    throw new Error("Shadowrocket node name contains an unsupported delimiter.");
  }
  return name;
}

function required(node: FlowMap, key: string): string {
  const value = scalar(node, key);
  if (!value) {
    throw new Error(
      `Shadowrocket ${scalar(node, "type") ?? "proxy"} node is missing ${key}.`,
    );
  }
  return nativeValue(value, key);
}

function enabled(node: FlowMap, key: string): boolean {
  return /^(?:true|1|yes)$/i.test(scalar(node, key) ?? "");
}

function appendOption(
  options: string[],
  name: string,
  value: string | undefined,
): void {
  if (value === undefined || value === "") return;
  options.push(`${name}=${nativeValue(value, name)}`);
}

function appendTlsOptions(options: string[], node: FlowMap): void {
  appendOption(options, "peer", scalar(node, "servername") ?? scalar(node, "sni"));
  if (enabled(node, "skip-cert-verify")) {
    options.push("allowInsecure=1");
  }
  const alpn = scalarList(node, "alpn");
  if (alpn.length) appendOption(options, "alpn", alpn[0]);
}

function appendTransportOptions(options: string[], node: FlowMap): void {
  if (enabled(node, "udp")) options.push("udp=1");
  if (enabled(node, "tfo")) options.push("tfo=1");
}

function renderAnyTls(node: FlowMap): string {
  const options = [
    nodeName(node),
    "= anytls",
    required(node, "server"),
    required(node, "port"),
    `password=${required(node, "password")}`,
  ];
  appendTransportOptions(options, node);
  appendTlsOptions(options, node);
  return `${options[0]} ${options.slice(1).join(", ")}`;
}

function renderTuic(node: FlowMap): string {
  const options = [
    nodeName(node),
    "= tuic",
    required(node, "server"),
    required(node, "port"),
    `password=${required(node, "password")}`,
    `user=${required(node, "uuid")}`,
  ];
  appendTransportOptions(options, node);
  appendOption(options, "congestion-controller", scalar(node, "congestion-controller"));
  appendOption(options, "udp-relay-mode", scalar(node, "udp-relay-mode"));
  appendTlsOptions(options, node);
  return `${options[0]} ${options.slice(1).join(", ")}`;
}

function renderHysteria2(node: FlowMap): string {
  if (scalar(node, "ports")) {
    throw new Error(
      "Shadowrocket Hysteria2 port hopping is not supported by the native renderer.",
    );
  }
  const options = [
    nodeName(node),
    "= hysteria2",
    required(node, "server"),
    required(node, "port"),
    `auth=${required(node, "password")}`,
  ];
  appendTransportOptions(options, node);
  appendTlsOptions(options, node);
  const obfs = scalar(node, "obfs");
  if (obfs && obfs.toLowerCase() !== "salamander") {
    throw new Error(`Shadowrocket Hysteria2 obfs ${obfs} is not supported.`);
  }
  appendOption(options, "obfsParam", scalar(node, "obfs-password"));
  appendOption(options, "upmbps", scalar(node, "up"));
  appendOption(options, "downmbps", scalar(node, "down"));
  return `${options[0]} ${options.slice(1).join(", ")}`;
}

function renderVless(node: FlowMap): string {
  const reality = nested(node, "reality-opts");
  const tlsEnabled = enabled(node, "tls") || Boolean(reality);
  const options = [
    nodeName(node),
    "= vless",
    required(node, "server"),
    required(node, "port"),
    `password=${required(node, "uuid")}`,
  ];
  appendOption(options, "flow", scalar(node, "flow"));
  if (tlsEnabled) options.push("tls=true");
  appendTlsOptions(options, node);
  appendTransportOptions(options, node);
  appendOption(options, "fp", scalar(node, "client-fingerprint"));

  if (reality) {
    options.push("security=reality");
    appendOption(options, "pbk", scalar(reality, "public-key"));
    appendOption(options, "sid", scalar(reality, "short-id"));
  }

  const network = scalar(node, "network")?.toLowerCase();
  if (network === "grpc") {
    options.push("obfs=grpc");
    appendOption(
      options,
      "path",
      scalar(nested(node, "grpc-opts") ?? {}, "grpc-service-name"),
    );
  } else if (network === "ws") {
    options.push(`obfs=${tlsEnabled ? "wss" : "websocket"}`);
    const ws = nested(node, "ws-opts") ?? {};
    appendOption(options, "path", scalar(ws, "path"));
    const host = scalar(nested(ws, "headers") ?? {}, "Host");
    if (host) appendOption(options, "obfsParam", host);
  } else if (network && network !== "tcp") {
    throw new Error(`Shadowrocket VLESS network ${network} is not supported.`);
  }

  return `${options[0]} ${options.slice(1).join(", ")}`;
}

function renderMissingNode(node: FlowMap): string {
  switch (required(node, "type").toLowerCase()) {
    case "anytls":
      return renderAnyTls(node);
    case "tuic":
      return renderTuic(node);
    case "hysteria2":
    case "hy2":
      return renderHysteria2(node);
    case "vless":
      return renderVless(node);
    default:
      throw new Error(
        `Shadowrocket native conversion omitted unsupported proxy type ${required(node, "type")}.`,
      );
  }
}

function needsShadowrocketDialect(node: FlowMap): boolean {
  return ["anytls", "tuic", "hysteria2", "hy2", "vless"].includes(
    (scalar(node, "type") ?? "").toLowerCase(),
  );
}

function sectionRange(lines: string[], heading: string): [number, number] {
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start < 0) throw new Error(`Shadowrocket config is missing ${heading}.`);
  const relativeEnd = lines
    .slice(start + 1)
    .findIndex((line) => /^\s*\[[^\]]+\]\s*$/.test(line));
  return [start, relativeEnd < 0 ? lines.length : start + 1 + relativeEnd];
}

function nativeAssignmentName(line: string): string | undefined {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith(";")) {
    return undefined;
  }
  const separator = line.indexOf("=");
  if (separator < 1) return undefined;
  const name = line.slice(0, separator).trim();
  return name || undefined;
}

function proxyNames(lines: string[]): Set<string> {
  const [start, end] = sectionRange(lines, "[Proxy]");
  return new Set(
    lines
      .slice(start + 1, end)
      .flatMap((line) => nativeAssignmentName(line) ?? []),
  );
}

/**
 * Surge collapses a select group with only DIRECT left into a same-named
 * direct proxy. That happens when every provider node uses a protocol the
 * Surge rendering pass cannot see yet (for example an AnyTLS-only provider).
 * Remember and remove the alias before the lossless node pass restores nodes.
 */
function removeCollapsedManualSelector(lines: string[]): boolean {
  const [start, end] = sectionRange(lines, "[Proxy]");
  for (let index = start + 1; index < end; index += 1) {
    const separator = lines[index].indexOf("=");
    if (separator < 1) continue;
    const name = lines[index].slice(0, separator).trim();
    const value = lines[index].slice(separator + 1).trim();
    if (name === MANUAL_SELECTOR && /^direct(?:\s*,.*)?$/i.test(value)) {
      lines.splice(index, 1);
      return true;
    }
  }
  return false;
}

function restoreCollapsedManualSelector(lines: string[]): void {
  const [start, end] = sectionRange(lines, "[Proxy Group]");
  if (
    lines
      .slice(start + 1, end)
      .some((line) => nativeAssignmentName(line) === MANUAL_SELECTOR)
  ) {
    return;
  }

  const members = ["DIRECT", ...proxyNames(lines)];
  lines.splice(
    start + 1,
    0,
    `${MANUAL_SELECTOR} = select,${members.join(",")},policy-select-name=DIRECT`,
  );
}

function addStableDefaultsAndNodes(
  lines: string[],
  extraNames: string[],
  unavailableNames: ReadonlySet<string>,
): void {
  const [start, end] = sectionRange(lines, "[Proxy Group]");
  for (let index = start + 1; index < end; index += 1) {
    const groupName = nativeAssignmentName(lines[index]);
    if (!groupName) continue;
    const separator = lines[index].indexOf("=");
    const value = lines[index].slice(separator + 1).trim();
    const match = value.match(/^select\s*,\s*(.*)$/i);
    if (!match) continue;
    const fields = splitTopLevel(match[1]);
    if (fields.some((field) => !field)) {
      throw new Error(`Shadowrocket policy group ${groupName} has an empty member.`);
    }
    const optionIndex = fields.findIndex((field) => NATIVE_OPTION_PREFIX.test(field));
    const members = (optionIndex < 0 ? fields : fields.slice(0, optionIndex))
      .filter((member) => !unavailableNames.has(member));
    const options = (optionIndex < 0 ? [] : fields.slice(optionIndex))
      .filter((option) => !/^policy-select-name=/i.test(option))
      // On affected Shadowrocket builds, merely emitting `hidden` for the
      // manual selector removes it from the proxy-group list even as
      // `hidden=0`. Absence is the portable visible form.
      .filter(
        (option) =>
          groupName !== "♻️ 手动切换" || !/^hidden=/i.test(option),
      );
    if (!members.length) {
      throw new Error(`Shadowrocket policy group ${groupName} has no members.`);
    }
    for (const name of extraNames) {
      if (!members.includes(name)) members.push(name);
    }
    options.push(`policy-select-name=${members[0]}`);
    lines[index] = `${groupName} = select,${[...members, ...options].join(",")}`;
  }
}

function ensureBlankLineAfterSection(lines: string[], heading: string): void {
  const [start] = sectionRange(lines, heading);
  if (lines[start + 1]?.trim()) lines.splice(start + 1, 0, "");
}

function skippedNodeComment(node: FlowMap, error: unknown): string {
  const name = nodeName(node);
  const type = (scalar(node, "type") || "unknown").replace(/[\r\n]/g, " ");
  const reason = (error instanceof Error ? error.message : "unsupported node")
    .replace(/[\r\n]/g, " ");
  return `# WARNING: skipped proxy "${name}" (${type}): ${reason}`;
}

/**
 * Builds a native Shadowrocket config from the engine's mature Surge skeleton
 * and a lossless Mihomo node list. The skeleton preserves the selected remote
 * config's rules and policy relationships; the node list restores modern
 * protocols filtered by the older Surge renderer.
 */
export function buildShadowrocketConfig(
  nativeSkeleton: string,
  mihomoNodes: string,
): string {
  const lines = nativeSkeleton.replace(/\r\n/g, "\n").split("\n");
  sectionRange(lines, "[Proxy Group]");
  sectionRange(lines, "[Rule]");
  const manualSelectorWasCollapsed = removeCollapsedManualSelector(lines);

  for (let index = 0; index < lines.length; index += 1) {
    lines[index] = lines[index].replace(/^bypass-tun\s*=/, "tun-excluded-routes =");
  }

  const [proxyStart, proxyEnd] = sectionRange(lines, "[Proxy]");
  for (let index = proxyEnd - 1; index > proxyStart; index -= 1) {
    if (/^\s*DIRECT\s*=\s*direct\s*$/i.test(lines[index])) lines.splice(index, 1);
  }

  const nodes = parseMihomoFlowProxies(mihomoNodes);
  const existing = proxyNames(lines);
  const candidates = nodes.filter(
    (node) => needsShadowrocketDialect(node) || !existing.has(nodeName(node)),
  );
  const rendered: Array<{ name: string; line: string }> = [];
  const skipped = new Set<string>();
  const warnings: string[] = [];
  for (const node of candidates) {
    const name = nodeName(node);
    try {
      rendered.push({ name, line: renderMissingNode(node) });
    } catch (error) {
      skipped.add(name);
      warnings.push(skippedNodeComment(node, error));
    }
  }

  const replaced = new Set([
    ...rendered.map((item) => item.name),
    ...nodes.filter(needsShadowrocketDialect).map(nodeName),
  ]);
  const [, beforeOverrideEnd] = sectionRange(lines, "[Proxy]");
  for (let index = beforeOverrideEnd - 1; index > proxyStart; index -= 1) {
    const name = nativeAssignmentName(lines[index]);
    if (name && replaced.has(name)) lines.splice(index, 1);
  }

  const [, refreshedProxyEnd] = sectionRange(lines, "[Proxy]");
  let insertAt = refreshedProxyEnd;
  while (insertAt > proxyStart + 1 && !lines[insertAt - 1].trim()) insertAt -= 1;
  lines.splice(insertAt, 0, ...warnings, ...rendered.map((item) => item.line));
  if (manualSelectorWasCollapsed) restoreCollapsedManualSelector(lines);
  addStableDefaultsAndNodes(
    lines,
    rendered.map((item) => item.name),
    skipped,
  );
  // Keep the native section boundary explicit. On the affected device the
  // only missing policy was the first entry immediately after this heading.
  ensureBlankLineAfterSection(lines, "[Proxy]");
  ensureBlankLineAfterSection(lines, "[Proxy Group]");
  ensureBlankLineAfterSection(lines, "[Rule]");

  return lines.join("\n");
}
