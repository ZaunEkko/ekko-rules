import { readFile } from "node:fs/promises";

export type DetectedLanAddress = {
  ipv4: string;
  baseUrl: string;
  updatedAt: string | null;
};

const DETECTED_LAN_MAX_AGE_MS = 30_000;
const DETECTED_LAN_MAX_FUTURE_SKEW_MS = 5_000;

export function isPrivateLanIpv4(value: string): boolean {
  const parts = value.split(".");
  if (parts.length !== 4) return false;
  const octets = parts.map((part) => Number(part));
  if (
    octets.some(
      (part, index) =>
        !/^\d{1,3}$/.test(parts[index]) ||
        !Number.isInteger(part) ||
        part < 0 ||
        part > 255,
    )
  ) {
    return false;
  }
  const [a, b] = octets;
  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

export function parseDetectedLanAddress(
  input: unknown,
  webPort: number,
  nowMs = Date.now(),
): DetectedLanAddress | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Record<string, unknown>;
  if (typeof value.ipv4 !== "string" || !isPrivateLanIpv4(value.ipv4)) {
    return null;
  }
  if (typeof value.updatedAt !== "string") return null;
  const updatedAtMs = Date.parse(value.updatedAt);
  if (!Number.isFinite(updatedAtMs)) return null;
  const ageMs = nowMs - updatedAtMs;
  if (
    ageMs > DETECTED_LAN_MAX_AGE_MS ||
    ageMs < -DETECTED_LAN_MAX_FUTURE_SKEW_MS
  ) {
    return null;
  }
  return {
    ipv4: value.ipv4,
    baseUrl: `http://${value.ipv4}:${webPort}`,
    updatedAt: value.updatedAt,
  };
}

export async function readDetectedLanAddress(
  filePath: string,
  webPort: number,
  nowMs = Date.now(),
): Promise<DetectedLanAddress | null> {
  try {
    const payload = JSON.parse(await readFile(filePath, "utf8")) as unknown;
    return parseDetectedLanAddress(payload, webPort, nowMs);
  } catch {
    return null;
  }
}
