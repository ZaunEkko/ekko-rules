import type { TargetFormat } from "./capabilities";
import type { ConvertOptions } from "./options";

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function topLevelSectionEnd(lines: string[], start: number): number {
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^[A-Za-z][A-Za-z0-9-]*:\s*/.test(lines[index])) return index;
  }
  return lines.length;
}

function isXudpProxyType(value: string): boolean {
  return value.toLowerCase() === "vless" || value.toLowerCase() === "vmess";
}

function flowProxyType(line: string): string | undefined {
  const match = line.match(
    /(?:\{|,\s*)type:\s*(?:"([^"]+)"|'([^']+)'|([^,}\s]+))(?=\s*[,}])/i,
  );
  return match?.[1] ?? match?.[2] ?? match?.[3];
}

function forceFlowProxyXudp(line: string): string {
  if (!isXudpProxyType(flowProxyType(line) ?? "")) return line;
  if (/(?:\{|,\s*)packet-encoding:\s*[^,}]+/i.test(line)) {
    return line.replace(
      /((?:\{|,\s*)packet-encoding:\s*)[^,}]+/i,
      "$1xudp",
    );
  }
  if (/(?:\{|,\s*)xudp:\s*[^,}]+/i.test(line)) {
    return line.replace(/((?:\{|,\s*)xudp:\s*)[^,}]+/i, "$1true");
  }
  const closingBrace = line.lastIndexOf("}");
  if (closingBrace < 0) return line;
  return `${line.slice(0, closingBrace).trimEnd()}, packet-encoding: xudp${line.slice(closingBrace)}`;
}

function blockProxyType(block: string[]): string | undefined {
  for (const line of block) {
    const match = line.match(
      /^\s+(?:-\s+)?type:\s*(?:"([^"]+)"|'([^']+)'|([^\s#]+))/i,
    );
    if (match) return match[1] ?? match[2] ?? match[3];
  }
  return undefined;
}

function forceBlockProxyXudp(block: string[]): string[] {
  if (!isXudpProxyType(blockProxyType(block) ?? "")) return block;
  const rewritten = [...block];
  const packetEncoding = rewritten.findIndex((line) =>
    /^\s{4}packet-encoding:\s*/i.test(line),
  );
  if (packetEncoding >= 0) {
    rewritten[packetEncoding] = "    packet-encoding: xudp";
    return rewritten;
  }
  const legacyXudp = rewritten.findIndex((line) => /^\s{4}xudp:\s*/i.test(line));
  if (legacyXudp >= 0) {
    rewritten[legacyXudp] = "    xudp: true";
    return rewritten;
  }
  rewritten.push("    packet-encoding: xudp");
  return rewritten;
}

export function forceMihomoXudp(body: string): string {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const proxiesStart = lines.findIndex((line) => /^proxies:\s*$/.test(line));
  if (proxiesStart < 0) return body;
  const proxiesEnd = topLevelSectionEnd(lines, proxiesStart);
  const rewritten: string[] = [];

  for (let index = proxiesStart + 1; index < proxiesEnd; ) {
    if (!/^  -\s+/.test(lines[index])) {
      rewritten.push(lines[index]);
      index += 1;
      continue;
    }
    let end = index + 1;
    while (end < proxiesEnd && !/^  -\s+/.test(lines[end])) end += 1;
    const block = lines.slice(index, end);
    const forced =
      block.length === 1 && /^  -\s*\{/.test(block[0])
        ? [forceFlowProxyXudp(block[0])]
        : forceBlockProxyXudp(block);
    rewritten.push(...forced);
    index = end;
  }

  lines.splice(proxiesStart + 1, proxiesEnd - proxiesStart - 1, ...rewritten);
  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}

function removeSingboxIpv6(config: JsonObject): boolean {
  let changed = false;
  const dns = isJsonObject(config.dns) ? config.dns : undefined;
  const fakeip = dns && isJsonObject(dns.fakeip) ? dns.fakeip : undefined;
  if (fakeip && "inet6_range" in fakeip) {
    delete fakeip.inet6_range;
    changed = true;
  }

  if (dns && Array.isArray(dns.rules)) {
    for (const rule of dns.rules) {
      if (!isJsonObject(rule) || !Array.isArray(rule.query_type)) continue;
      const queryTypes = rule.query_type.filter(
        (type) => typeof type !== "string" || type.toUpperCase() !== "AAAA",
      );
      if (queryTypes.length !== rule.query_type.length) {
        rule.query_type = queryTypes;
        changed = true;
      }
    }
  }

  if (Array.isArray(config.inbounds)) {
    for (const inbound of config.inbounds) {
      if (!isJsonObject(inbound) || inbound.type !== "tun") continue;
      for (const key of Object.keys(inbound)) {
        if (key.startsWith("inet6_")) {
          delete inbound[key];
          changed = true;
        }
      }
      if (Array.isArray(inbound.address)) {
        const addresses = inbound.address.filter(
          (address) => typeof address !== "string" || !address.includes(":"),
        );
        if (addresses.length !== inbound.address.length) {
          inbound.address = addresses;
          changed = true;
        }
      }
    }
  }
  return changed;
}

function forceSingboxXudp(config: JsonObject): boolean {
  if (!Array.isArray(config.outbounds)) return false;
  let changed = false;
  for (const outbound of config.outbounds) {
    if (!isJsonObject(outbound) || typeof outbound.type !== "string") continue;
    if (!isXudpProxyType(outbound.type)) continue;
    if (outbound.packet_encoding !== "xudp") {
      outbound.packet_encoding = "xudp";
      changed = true;
    }
  }
  return changed;
}

export function applyTargetOutputOptions(
  body: string,
  target: TargetFormat,
  options: ConvertOptions,
): string {
  if (target === "clash") {
    return options.xudp ? forceMihomoXudp(body) : body;
  }
  if (target !== "singbox") return body;

  const parsed = JSON.parse(body) as unknown;
  if (!isJsonObject(parsed)) return body;
  const ipv6Changed = !options.singboxIpv6 && removeSingboxIpv6(parsed);
  const xudpChanged = options.xudp && forceSingboxXudp(parsed);
  const changed = ipv6Changed || xudpChanged;
  return changed ? `${JSON.stringify(parsed, null, 2)}\n` : body;
}
