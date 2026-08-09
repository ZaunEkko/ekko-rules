import { readFile } from "node:fs/promises";

export type DetectedLanAddress = {
  ipv4: string;
  baseUrl: string;
  updatedAt: string | null;
};

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
): DetectedLanAddress | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Record<string, unknown>;
  if (typeof value.ipv4 !== "string" || !isPrivateLanIpv4(value.ipv4)) {
    return null;
  }
  const updatedAt =
    typeof value.updatedAt === "string" &&
    Number.isFinite(Date.parse(value.updatedAt))
      ? value.updatedAt
      : null;
  return {
    ipv4: value.ipv4,
    baseUrl: `http://${value.ipv4}:${webPort}`,
    updatedAt,
  };
}

export async function readDetectedLanAddress(
  filePath: string,
  webPort: number,
): Promise<DetectedLanAddress | null> {
  try {
    const payload = JSON.parse(await readFile(filePath, "utf8")) as unknown;
    return parseDetectedLanAddress(payload, webPort);
  } catch {
    return null;
  }
}
