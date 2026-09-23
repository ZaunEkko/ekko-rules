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

function nodeName(node: FlowMap): string {
  const name = scalar(node, "name");
  if (!name || /[\r\n,=]/.test(name)) {
    throw new Error("Shadowrocket node name contains an unsupported delimiter.");
  }
  return name;
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

/** Surge may collapse the manual group when none of its node dialects survive. */
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

  lines.splice(
    start + 1,
    0,
    `${MANUAL_SELECTOR} = select,PROXY,DIRECT,policy-select-name=PROXY`,
  );
}

function bridgeHomeProxyIntoGroups(
  lines: string[],
  embeddedNodeNames: ReadonlySet<string>,
): void {
  const [start, end] = sectionRange(lines, "[Proxy Group]");
  for (let index = start + 1; index < end; index += 1) {
    const groupName = nativeAssignmentName(lines[index]);
    if (!groupName) continue;
    const separator = lines[index].indexOf("=");
    const value = lines[index].slice(separator + 1).trim();
    const match = value.match(/^([a-z][a-z-]*)\s*,\s*(.*)$/i);
    if (!match) continue;
    const groupType = match[1];
    const fields = splitTopLevel(match[2]);
    if (fields.some((field) => !field)) {
      throw new Error(`Shadowrocket policy group ${groupName} has an empty member.`);
    }
    const optionIndex = fields.findIndex((field) => NATIVE_OPTION_PREFIX.test(field));
    let members = (optionIndex < 0 ? fields : fields.slice(0, optionIndex))
      .filter((member) => !embeddedNodeNames.has(member));
    const options = (optionIndex < 0 ? [] : fields.slice(optionIndex))
      .filter((option) => !/^policy-select-name=/i.test(option))
      // On affected Shadowrocket builds, merely emitting `hidden` for the
      // manual selector removes it from the proxy-group list even as
      // `hidden=0`. Absence is the portable visible form.
      .filter(
        (option) =>
          groupName !== "♻️ 手动切换" || !/^hidden=/i.test(option),
      );
    if (groupName === MANUAL_SELECTOR) {
      members = ["PROXY", ...members.filter((member) => member !== "PROXY")];
    } else if (!members.includes("PROXY")) {
      members.push("PROXY");
    }
    if (!members.length) throw new Error(`Shadowrocket policy group ${groupName} has no members.`);
    if (/^select$/i.test(groupType)) {
      options.push(`policy-select-name=${members[0]}`);
    }
    lines[index] = `${groupName} = ${groupType},${[...members, ...options].join(",")}`;
  }
}

function clearEmbeddedProxyDefinitions(lines: string[]): Set<string> {
  const names = proxyNames(lines);
  names.delete("DIRECT");
  names.delete("REJECT");
  names.delete("PROXY");
  const [start, end] = sectionRange(lines, "[Proxy]");
  for (let index = end - 1; index > start; index -= 1) {
    if (nativeAssignmentName(lines[index])) lines.splice(index, 1);
  }
  lines.splice(
    start + 1,
    0,
    "# Nodes stay in the Home subscription; PROXY uses its selected node.",
  );
  return names;
}

function ensureBlankLineAfterSection(lines: string[], heading: string): void {
  const [start] = sectionRange(lines, heading);
  if (lines[start + 1]?.trim()) lines.splice(start + 1, 0, "");
}

/**
 * Builds a native Shadowrocket config from the engine's mature Surge skeleton
 * and a lossless Mihomo node list. The skeleton preserves rules and policy
 * relationships. Nodes deliberately remain in Shadowrocket's Home subscription:
 * the native PROXY policy bridges config-mode traffic to the node selected there.
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

  const nodes = parseMihomoFlowProxies(mihomoNodes);
  const embeddedNodeNames = clearEmbeddedProxyDefinitions(lines);
  for (const node of nodes) embeddedNodeNames.add(nodeName(node));
  if (manualSelectorWasCollapsed) restoreCollapsedManualSelector(lines);
  bridgeHomeProxyIntoGroups(lines, embeddedNodeNames);
  // Keep the native section boundary explicit. On the affected device the
  // only missing policy was the first entry immediately after this heading.
  ensureBlankLineAfterSection(lines, "[Proxy]");
  ensureBlankLineAfterSection(lines, "[Proxy Group]");
  ensureBlankLineAfterSection(lines, "[Rule]");

  return lines.join("\n");
}
