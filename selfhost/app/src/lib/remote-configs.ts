import { isSupportedTarget } from "./capabilities";

/**
 * Remote configs the engine may be pointed at.
 *
 * Curated entries are addressed by a short id so a shared link stays readable.
 * A visitor may also paste their own URL — the result only shapes their own
 * config — but the fetch is made by this server, not by their browser, so a
 * pasted URL is still validated against the same SSRF rules as a subscription
 * and the engine carries hard ceilings on how much a config may pull in.
 */

export type RemoteConfigPreset = {
  id: string;
  label: string;
  description: string;
  /** Value handed to the engine's `config` parameter. */
  value: string;
  builtin: boolean;
};

export const BUILTIN_REMOTE_CONFIG_ID = "ekko";
export const LITE_REMOTE_CONFIG_ID = "ekko-lite";

const ACL4SSR_RAW =
  "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/config";

/**
 * Third-party presets. The files stay on their own project's servers; this
 * repository ships only the reference. See NOTICE.md for attribution.
 */
const THIRD_PARTY_PRESETS: ReadonlyArray<Omit<RemoteConfigPreset, "builtin">> = [
  {
    id: "acl4ssr-full",
    label: "ACL4SSR 全分组",
    description: "分组最全，重度用户常用",
    value: `${ACL4SSR_RAW}/ACL4SSR_Online_Full.ini`,
  },
  {
    id: "acl4ssr-full-noauto",
    label: "ACL4SSR 全分组 无测速",
    description: "全分组，不自动测速选择节点",
    value: `${ACL4SSR_RAW}/ACL4SSR_Online_Full_NoAuto.ini`,
  },
  {
    id: "acl4ssr-full-adblock",
    label: "ACL4SSR 全分组 去广告",
    description: "全分组，更强的广告拦截",
    value: `${ACL4SSR_RAW}/ACL4SSR_Online_Full_AdblockPlus.ini`,
  },
  {
    id: "acl4ssr-full-netflix",
    label: "ACL4SSR 全分组 Netflix",
    description: "全分组，奈飞全量分流",
    value: `${ACL4SSR_RAW}/ACL4SSR_Online_Full_Netflix.ini`,
  },
  {
    id: "acl4ssr-full-multimode",
    label: "ACL4SSR 全分组 多模式",
    description: "全分组，自动测速、故障转移与负载均衡",
    value: `${ACL4SSR_RAW}/ACL4SSR_Online_Full_MultiMode.ini`,
  },
  {
    id: "acl4ssr",
    label: "ACL4SSR 默认版",
    description: "常用分组，体积适中",
    value: `${ACL4SSR_RAW}/ACL4SSR_Online.ini`,
  },
  {
    id: "acl4ssr-noauto",
    label: "ACL4SSR 默认版 无测速",
    description: "默认分组，不自动测速选择节点",
    value: `${ACL4SSR_RAW}/ACL4SSR_Online_NoAuto.ini`,
  },
  {
    id: "acl4ssr-adblock",
    label: "ACL4SSR 默认版 去广告",
    description: "默认分组，更强的广告拦截",
    value: `${ACL4SSR_RAW}/ACL4SSR_Online_AdblockPlus.ini`,
  },
  {
    id: "acl4ssr-mini",
    label: "ACL4SSR 精简版",
    description: "精简分组，规则数量更少",
    value: `${ACL4SSR_RAW}/ACL4SSR_Online_Mini.ini`,
  },
  {
    id: "acl4ssr-mini-ai",
    label: "ACL4SSR 精简版 AI",
    description: "精简分组，单独分流 AI 服务",
    value: `${ACL4SSR_RAW}/ACL4SSR_Online_Mini_Ai.ini`,
  },
  {
    id: "acl4ssr-mini-multicountry",
    label: "ACL4SSR 精简版 多国家",
    description: "精简分组，带港美日等国家分组",
    value: `${ACL4SSR_RAW}/ACL4SSR_Online_Mini_MultiCountry.ini`,
  },
];

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const MAX_PRESETS = 24;

export function builtinRemoteConfig(fixedConfigPath: string): RemoteConfigPreset {
  return {
    id: BUILTIN_REMOTE_CONFIG_ID,
    label: "Ekko Rules",
    description: "本仓库维护的完整规则、策略组与 DNS 配置",
    value: fixedConfigPath,
    builtin: true,
  };
}

/**
 * The lite product is the same rules behind fewer switches.
 *
 * It is derived from the full config's path so a deployment that points the
 * engine somewhere else keeps both entries pointing at the same place. What it
 * changes is only how many policy groups a client shows: every rule, and what
 * each rule does, is identical to the full product.
 */
export function liteRemoteConfig(fixedConfigPath: string): RemoteConfigPreset {
  return {
    id: LITE_REMOTE_CONFIG_ID,
    label: "Ekko Rules 精简",
    description: "同一套规则，策略组从 42 个收成 10 个",
    value: fixedConfigPath.replace(/\.ini$/, "-lite.ini"),
    builtin: true,
  };
}

function cleanText(value: unknown, limit: number): string {
  if (typeof value !== "string") return "";
  const trimmed = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return trimmed.slice(0, limit);
}

/**
 * `REMOTE_CONFIGS` is a JSON array of `{ id, label, description, url }`.
 * Anything malformed is dropped rather than failing startup, so one bad entry
 * cannot take the deployment down.
 */
export function parseRemoteConfigPresets(
  raw: string | undefined,
  fixedConfigPath: string,
  includeThirdParty = true,
): RemoteConfigPreset[] {
  // Ekko Rules is always first and is what an empty `config` resolves to.
  const presets = [
    builtinRemoteConfig(fixedConfigPath),
    liteRemoteConfig(fixedConfigPath),
  ];
  const seen = new Set([BUILTIN_REMOTE_CONFIG_ID, LITE_REMOTE_CONFIG_ID]);

  if (includeThirdParty) {
    for (const preset of THIRD_PARTY_PRESETS) {
      seen.add(preset.id);
      presets.push({ ...preset, builtin: false });
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse((raw || "").trim() || "[]");
  } catch {
    return presets;
  }
  if (!Array.isArray(parsed)) return presets;

  for (const entry of parsed) {
    if (presets.length >= MAX_PRESETS) break;
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    const id = cleanText(item.id, 32).toLowerCase();
    const url = cleanText(item.url, 512);
    if (!ID_PATTERN.test(id) || seen.has(id)) continue;
    if (!/^https:\/\//.test(url)) continue;
    try {
      new URL(url);
    } catch {
      continue;
    }
    seen.add(id);
    presets.push({
      id,
      label: cleanText(item.label, 60) || id,
      description: cleanText(item.description, 160),
      value: url,
      builtin: false,
    });
  }
  return presets;
}

export function publicRemoteConfigs(presets: RemoteConfigPreset[]) {
  return presets.map((preset) => ({
    id: preset.id,
    label: preset.label,
    description: preset.description,
    builtin: preset.builtin,
  }));
}

/**
 * Turns the `config` parameter of a link into a value the engine may use.
 * An empty value always means this repository's own rules.
 */
export const CUSTOM_REMOTE_CONFIG_ID = "custom";

export function resolveRemoteConfig(
  requested: string | null | undefined,
  presets: RemoteConfigPreset[],
  allowCustomUrl: boolean,
): RemoteConfigPreset {
  const value = (requested || "").trim();
  if (!value) {
    return presets[0];
  }
  const matched = presets.find((preset) => preset.id === value.toLowerCase());
  if (matched) return matched;

  // A value that is not a URL at all can only have been meant as a preset id.
  if (!allowCustomUrl || !/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    throw new Error("remoteConfig is not an available option.");
  }
  if (value.length > 512) {
    throw new Error("remoteConfig URL is too long.");
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("remoteConfig must be a valid https URL.");
  }
  // https only: the engine fetches this server-side, and a cleartext fetch of
  // someone else's config is trivially tampered with in transit.
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error("remoteConfig must be a valid https URL.");
  }
  return {
    id: CUSTOM_REMOTE_CONFIG_ID,
    label: "自定义远程配置",
    description: "",
    value: parsed.href,
    builtin: false,
  };
}

export function isCustomRemoteConfig(preset: RemoteConfigPreset): boolean {
  return preset.id === CUSTOM_REMOTE_CONFIG_ID;
}

export function isRemoteConfigTargetSupported(
  _preset: RemoteConfigPreset,
  target: string,
): boolean {
  return isSupportedTarget(target);
}
