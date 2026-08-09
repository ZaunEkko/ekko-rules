export type ConvertOptions = {
  autoUpdate: boolean;
  emoji: boolean;
  udp: boolean;
  tfo: boolean;
  skipCertVerify: boolean;
  tls13: boolean;
  sort: boolean;
  filterUnsupported: boolean;
  appendType: boolean;
  include: string;
  exclude: string;
  rename: string;
  customUserAgent: string;
  updateIntervalHours: number;
  singboxIpv6: boolean;
};

export const DEFAULT_CONVERT_OPTIONS: ConvertOptions = {
  autoUpdate: false,
  emoji: true,
  udp: false,
  tfo: false,
  skipCertVerify: false,
  tls13: false,
  sort: false,
  filterUnsupported: true,
  appendType: false,
  include: "",
  exclude: "",
  rename: "",
  customUserAgent: "",
  updateIntervalHours: 24,
  singboxIpv6: false,
};

const BOOLEAN_OPTIONS = [
  "autoUpdate",
  "emoji",
  "udp",
  "tfo",
  "skipCertVerify",
  "tls13",
  "sort",
  "filterUnsupported",
  "appendType",
  "singboxIpv6",
] as const;

const TEXT_LIMITS = {
  include: 500,
  exclude: 500,
  rename: 1_000,
  customUserAgent: 256,
} as const;

function cleanTextOption(
  name: keyof typeof TEXT_LIMITS,
  value: unknown,
): string {
  if (value === undefined) return DEFAULT_CONVERT_OPTIONS[name];
  if (typeof value !== "string") {
    throw new Error(`${name} must be a string.`);
  }
  if (value.length > TEXT_LIMITS[name]) {
    throw new Error(`${name} is too long.`);
  }
  if (/\0|[\r\n]/.test(value)) {
    throw new Error(`${name} contains unsupported control characters.`);
  }
  return value.trim();
}

export function parseConvertOptions(input: unknown): ConvertOptions {
  if (input === undefined) return { ...DEFAULT_CONVERT_OPTIONS };
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("options must be a JSON object when provided.");
  }

  const raw = input as Record<string, unknown>;
  const options = { ...DEFAULT_CONVERT_OPTIONS };

  for (const name of BOOLEAN_OPTIONS) {
    if (raw[name] === undefined) continue;
    if (typeof raw[name] !== "boolean") {
      throw new Error(`${name} must be a boolean.`);
    }
    options[name] = raw[name];
  }

  for (const name of Object.keys(TEXT_LIMITS) as Array<
    keyof typeof TEXT_LIMITS
  >) {
    options[name] = cleanTextOption(name, raw[name]);
  }

  if (raw.updateIntervalHours !== undefined) {
    if (
      typeof raw.updateIntervalHours !== "number" ||
      !Number.isInteger(raw.updateIntervalHours) ||
      raw.updateIntervalHours < 1 ||
      raw.updateIntervalHours > 168
    ) {
      throw new Error("updateIntervalHours must be an integer from 1 to 168.");
    }
    options.updateIntervalHours = raw.updateIntervalHours;
  }

  return options;
}

export function countEnabledOptions(options: ConvertOptions): number {
  return (
    BOOLEAN_OPTIONS.filter((name) => options[name]).length +
    (options.include ? 1 : 0) +
    (options.exclude ? 1 : 0) +
    (options.rename ? 1 : 0) +
    (options.customUserAgent ? 1 : 0)
  );
}
