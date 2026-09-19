export type ConvertOptions = {
  autoUpdate: boolean;
  emoji: boolean;
  udp: boolean;
  xudp: boolean;
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

/**
 * What an omitted parameter means.
 *
 * This is a contract with links that already exist. A stateless link carries
 * only the choices that differ from these, so changing a value here silently
 * changes what every link in the wild already means — someone who imported a
 * link months ago would get a different configuration on its next refresh
 * without touching anything. Treat these as frozen: a new recommendation goes
 * in RECOMMENDED_CONVERT_OPTIONS, which only decides what the form starts
 * with, and is then written into the link explicitly.
 */
export const DEFAULT_CONVERT_OPTIONS: ConvertOptions = {
  autoUpdate: false,
  emoji: true,
  udp: false,
  xudp: false,
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

/**
 * What the form starts with.
 *
 * These four either add information or stop a client receiving entries it
 * cannot use, and none of them reaches back to the provider, so someone who
 * changes nothing is better off with them on. Because they differ from the
 * wire defaults above, a generated link states them outright rather than
 * relying on the reader's defaults — which is what makes the link mean the
 * same thing tomorrow as it does today.
 */
export const RECOMMENDED_CONVERT_OPTIONS: ConvertOptions = {
  ...DEFAULT_CONVERT_OPTIONS,
  emoji: true,
  udp: true,
  xudp: true,
  filterUnsupported: true,
};

const BOOLEAN_OPTIONS = [
  "autoUpdate",
  "emoji",
  "udp",
  "xudp",
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
