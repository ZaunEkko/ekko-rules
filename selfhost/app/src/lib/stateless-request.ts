import { isSupportedTarget, type TargetFormat } from "./capabilities";
import {
  DEFAULT_CONVERT_OPTIONS,
  parseConvertOptions,
  type ConvertOptions,
} from "./options";

/**
 * Stateless conversion entry.
 *
 * An open deployment stores nothing: the generated link carries every choice
 * in its own query string, so one visitor's link is reachable only by whoever
 * holds it and no endpoint can enumerate anyone else's work.
 *
 * The trade-off is deliberate and must stay visible in the UI: the real
 * subscription travels inside the link, so it also lands in the client's
 * config file and in any log that records full URLs.
 */

export const STATELESS_SUBSCRIPTION_PATH = "/sub";

const BOOLEAN_PARAMS = {
  emoji: "emoji",
  udp: "udp",
  xudp: "xudp",
  tfo: "tfo",
  scv: "skipCertVerify",
  tls13: "tls13",
  sort: "sort",
  fdn: "filterUnsupported",
  append_type: "appendType",
  sbipv6: "singboxIpv6",
} as const satisfies Record<string, keyof ConvertOptions>;

const TEXT_PARAMS = {
  include: "include",
  exclude: "exclude",
  rename: "rename",
  ua: "customUserAgent",
} as const satisfies Record<string, keyof ConvertOptions>;

export const MAX_STATELESS_NAME_LENGTH = 50;

export type StatelessConvertRequest = {
  subscriptionUrl: string;
  target: TargetFormat;
  options: ConvertOptions;
  name: string;
  /** Raw `config` value; resolved against the preset list by the route. */
  remoteConfig: string;
};

function parseBooleanParam(raw: string, name: string): boolean {
  const value = raw.trim().toLowerCase();
  if (value === "true" || value === "1" || value === "yes") return true;
  if (value === "false" || value === "0" || value === "no") return false;
  throw new Error(`${name} must be true or false.`);
}

export function parseStatelessConvertQuery(
  params: URLSearchParams,
): StatelessConvertRequest {
  const subscriptionUrl = (params.get("url") || "").trim();
  if (!subscriptionUrl) {
    throw new Error("subscriptionUrl is required.");
  }

  const target = (params.get("target") || "clash").trim();
  if (!isSupportedTarget(target)) {
    throw new Error("A supported target is required.");
  }

  const draft: Record<string, unknown> = {};
  for (const [param, option] of Object.entries(BOOLEAN_PARAMS)) {
    const raw = params.get(param);
    if (raw === null) continue;
    draft[option] = parseBooleanParam(raw, param);
  }
  for (const [param, option] of Object.entries(TEXT_PARAMS)) {
    const raw = params.get(param);
    if (raw === null) continue;
    draft[option] = raw;
  }

  const interval = params.get("interval");
  if (interval !== null && interval.trim() !== "") {
    const hours = Number(interval);
    if (!Number.isInteger(hours) || hours < 1 || hours > 168) {
      throw new Error("updateIntervalHours must be between 1 and 168.");
    }
    draft.autoUpdate = true;
    draft.updateIntervalHours = hours;
  }

  const name = (params.get("name") || "").trim();
  if (name.length > MAX_STATELESS_NAME_LENGTH) {
    throw new Error("Profile name must be 50 characters or fewer.");
  }

  return {
    subscriptionUrl,
    target,
    options: parseConvertOptions(draft),
    name,
    remoteConfig: (params.get("config") || "").trim(),
  };
}

/**
 * Emits only the choices that differ from the defaults so a shared link stays
 * short and readable.
 */
export function buildStatelessConvertQuery(input: {
  subscriptionUrl: string;
  target: TargetFormat;
  options?: Partial<ConvertOptions>;
  name?: string;
  remoteConfig?: string;
}): string {
  const params = new URLSearchParams();
  params.set("url", input.subscriptionUrl.trim());
  params.set("target", input.target);

  const options = { ...DEFAULT_CONVERT_OPTIONS, ...(input.options || {}) };
  for (const [param, option] of Object.entries(BOOLEAN_PARAMS)) {
    const value = options[option] as boolean;
    if (value !== DEFAULT_CONVERT_OPTIONS[option]) {
      params.set(param, String(value));
    }
  }
  for (const [param, option] of Object.entries(TEXT_PARAMS)) {
    const value = (options[option] as string).trim();
    if (value) params.set(param, value);
  }
  if (options.autoUpdate) {
    params.set("interval", String(options.updateIntervalHours));
  }
  const name = (input.name || "").trim();
  if (name) params.set("name", name);
  const remoteConfig = (input.remoteConfig || "").trim();
  if (remoteConfig) params.set("config", remoteConfig);

  return params.toString();
}

export function buildStatelessSubscriptionUrl(
  baseUrl: string,
  input: Parameters<typeof buildStatelessConvertQuery>[0],
): string {
  const query = buildStatelessConvertQuery(input);
  const base = baseUrl.replace(/\/$/, "");
  return `${base}${STATELESS_SUBSCRIPTION_PATH}?${query}`;
}
