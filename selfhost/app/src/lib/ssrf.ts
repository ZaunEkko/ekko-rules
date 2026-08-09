import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { URL } from "node:url";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata",
]);

function parseIpv4(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((part) => Number(part));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return nums;
}

function isPrivateOrSpecialIpv4(ip: string): boolean {
  const parts = parseIpv4(ip);
  if (!parts) return true;
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast/reserved
  return false;
}

function parseIpv6Words(ip: string): number[] | null {
  let normalized = ip.toLowerCase();
  const dottedTail = normalized.match(/(^|:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dottedTail) {
    const ipv4 = parseIpv4(dottedTail[2]);
    if (!ipv4) return null;
    const ipv4Words = [
      (ipv4[0] << 8) | ipv4[1],
      (ipv4[2] << 8) | ipv4[3],
    ];
    normalized = `${normalized.slice(0, dottedTail.index)}${dottedTail[1]}${ipv4Words
      .map((word) => word.toString(16))
      .join(":")}`;
  }

  if ((normalized.match(/::/g) || []).length > 1) return null;
  const [leftRaw, rightRaw] = normalized.split("::", 2);
  const parseSide = (value: string): number[] | null => {
    if (!value) return [];
    const parts = value.split(":");
    if (parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null;
    return parts.map((part) => Number.parseInt(part, 16));
  };
  const left = parseSide(leftRaw);
  const right = parseSide(rightRaw ?? "");
  if (!left || !right) return null;

  if (!normalized.includes("::")) {
    return left.length === 8 ? left : null;
  }
  const missing = 8 - left.length - right.length;
  if (missing < 1) return null;
  return [...left, ...Array<number>(missing).fill(0), ...right];
}

function isPrivateOrSpecialIpv6(ip: string): boolean {
  const words = parseIpv6Words(ip);
  if (!words) return true;
  if (words.every((word) => word === 0)) return true; // unspecified
  if (words.slice(0, 7).every((word) => word === 0) && words[7] === 1) {
    return true; // loopback
  }
  if ((words[0] & 0xfe00) === 0xfc00) return true; // ULA fc00::/7
  if ((words[0] & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
  if ((words[0] & 0xff00) === 0xff00) return true; // multicast ff00::/8
  // IPv4-mapped IPv6 is 80 zero bits, ffff, then the IPv4 address.
  if (words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff) {
    const mappedIpv4 = [
      words[6] >> 8,
      words[6] & 0xff,
      words[7] >> 8,
      words[7] & 0xff,
    ].join(".");
    return isPrivateOrSpecialIpv4(mappedIpv4);
  }
  return false;
}

export function isBlockedIpAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateOrSpecialIpv4(ip);
  if (version === 6) return isPrivateOrSpecialIpv6(ip);
  return true;
}

export type SafeUrl = {
  href: string;
  hostname: string;
  protocol: "http:" | "https:";
};

export function parsePublicHttpUrl(raw: string): SafeUrl {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Invalid subscription URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http and https subscription URLs are allowed.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Subscription URLs must not include credentials.");
  }
  if (parsed.href.length > 2048) {
    throw new Error("Subscription URL is too long.");
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!hostname || BLOCKED_HOSTNAMES.has(hostname)) {
    throw new Error("Subscription host is not allowed.");
  }
  if (hostname.endsWith(".local") || hostname.endsWith(".localhost")) {
    throw new Error("Subscription host is not allowed.");
  }
  if (hostname.includes("%")) {
    throw new Error("Encoded hostnames are not allowed.");
  }
  if (isIP(hostname) && isBlockedIpAddress(hostname)) {
    throw new Error("Subscription host resolves to a blocked address.");
  }

  return {
    href: parsed.href,
    hostname,
    protocol: parsed.protocol as "http:" | "https:",
  };
}

function allowedHostnames(): Set<string> {
  return new Set(
    (process.env.CONVERT_ALLOW_HOSTNAMES || "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function assertPublicHostname(hostname: string): Promise<string[]> {
  const allow = allowedHostnames();
  const host = hostname.toLowerCase();
  // Explicit local allowlist is only for controlled Compose fixtures / lab use.
  const skipPrivateResolutionBlock = allow.has(host);

  if (isIP(hostname)) {
    if (!skipPrivateResolutionBlock && isBlockedIpAddress(hostname)) {
      throw new Error("Subscription host resolves to a blocked address.");
    }
    return [hostname];
  }

  let records: Array<{ address: string }>;
  try {
    records = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error("Unable to resolve subscription host.");
  }
  if (!records.length) {
    throw new Error("Unable to resolve subscription host.");
  }
  for (const record of records) {
    if (!skipPrivateResolutionBlock && isBlockedIpAddress(record.address)) {
      throw new Error("Subscription host resolves to a blocked address.");
    }
  }
  return records.map((record) => record.address);
}

export function redactUrl(raw: string): string {
  try {
    const parsed = new URL(raw);
    return `${parsed.protocol}//${parsed.host}/[redacted]`;
  } catch {
    return "[invalid-url]";
  }
}
