"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  countEnabledOptions,
  DEFAULT_CONVERT_OPTIONS,
  RECOMMENDED_CONVERT_OPTIONS,
  type ConvertOptions,
} from "@/lib/options";
import {
  clientInstallLabel,
  qrCodeValue,
  qrImportValue,
  qrPasteHint,
  qrScanHint,
  shadowrocketConfigImportValue,
  supportsClientInstallQr,
} from "@/lib/qr-import";
import {
  buildStatelessConvertQuery,
  clientImportPath,
  packStatelessQuery,
  shadowrocketConfigImportPath,
  shadowrocketConfigProfilePath,
  shadowrocketHomeImportPath,
  shadowrocketHomeProfilePath,
  type StatelessConvertRequest,
} from "@/lib/stateless-request";
import {
  dedupeSavedLinks,
  savedLinkIdentity,
} from "@/lib/saved-link-history";
import { Picker } from "./picker";
import { SiteMark } from "./site-mark";
import { Tally } from "./tally";

type Health = {
  status: string;
  deploy_mode?: "lan" | "public";
  stores_profiles?: boolean;
  metrics?: {
    visits_today: number;
    visits_total: number;
    conversions_today: number;
    conversions_total: number;
  } | null;
  deployment_error?: string | null;
  deployment_warning?: string | null;
  site_version: string;
  latest_site_version?: string | null;
  site_update_available?: boolean;
  /** Reported by the running engine; null while it is unreachable. */
  rules_version?: string | null;
  rules_built?: string | null;
  latest_rules_version?: string | null;
  rules_update_available?: boolean;
  repo_stars?: number | null;
  subconverter_reachable: boolean;
  access_password_required: boolean;
  lan_access_enabled: boolean;
  subscription_base_url: string | null;
  subscription_base_url_error: string | null;
  detected_lan_ipv4: string | null;
  detected_lan_base_url: string | null;
  detected_lan_updated_at: string | null;
};

type TargetCapability = {
  id: string;
  label: string;
  short_label: string;
  client_family: string;
  client_examples: string[];
  extension: string;
  tier: "mainstream" | "compatibility";
  protocol_note: string;
  verified_modern_protocols: string[];
};

type RemoteConfigOption = {
  id: string;
  label: string;
  description: string;
  builtin: boolean;
};

type Capabilities = {
  supported_targets: TargetCapability[];
  stores_profiles?: boolean;
  remote_configs?: RemoteConfigOption[];
  allow_custom_remote_config?: boolean;
  site_links?: { label: string; url: string }[];
};

type Profile = {
  id: string;
  name: string;
  target: string;
  createdAt: string;
  subscriptionPath: string;
  downloadPath: string;
  enabledOptionCount: number;
};

type ShadowrocketImportAddresses = {
  home: string;
  config: string;
};

/** Resolve the two stable URLs without changing the profile the user saved. */
function shadowrocketImportAddresses(
  profile: Profile,
  baseUrl: string,
): ShadowrocketImportAddresses {
  const separator = profile.subscriptionPath.indexOf("?");
  if (separator >= 0) {
    const query = profile.subscriptionPath.slice(separator + 1);
    return {
      home: absoluteLocalUrl(
        shadowrocketHomeImportPath(profile.name, query),
        baseUrl,
      ),
      config: absoluteLocalUrl(
        shadowrocketConfigImportPath(profile.name, query),
        baseUrl,
      ),
    };
  }
  return {
    home: absoluteLocalUrl(
      shadowrocketHomeProfilePath(profile.id, profile.name),
      baseUrl,
    ),
    config: absoluteLocalUrl(
      shadowrocketConfigProfilePath(profile.id, profile.name),
      baseUrl,
    ),
  };
}

const FALLBACK_TARGETS: TargetCapability[] = [
  {
    id: "clash",
    label: "Clash / Mihomo",
    short_label: "Clash",
    client_family: "Mihomo 内核客户端",
    client_examples: ["Clash Verge Rev", "Mihomo Party", "FlClash"],
    extension: "yaml",
    tier: "mainstream",
    protocol_note: "已验证保留 AnyTLS、Hysteria2、TUIC 与 VLESS Reality",
    verified_modern_protocols: [
      "AnyTLS",
      "Hysteria2",
      "TUIC",
      "VLESS Reality",
    ],
  },
];

const BASE_URL_STORAGE_KEY = "ekko-rules.subscription-base-url";
const BASE_URL_HISTORY_KEY = "ekko-rules.subscription-base-url-history";
const BASE_URL_MODE_KEY = "ekko-rules.subscription-base-url-mode";
// Remembered in this browser so a returning visitor picks an address instead of
// pasting it again. Several, because one person often holds several providers
// and switching between them is the whole point of keeping any of them.
//
// It never leaves the device: the server stores nothing either way. These
// addresses carry tokens, so each one can be forgotten individually and the
// list is capped rather than growing without end.
const SOURCE_HISTORY_KEY = "ekko-rules.saved-links";
const SAVED_LINK_LIMIT = 8;

/**
 * A link this browser produced before.
 *
 * The page rebuilds a link from scratch every visit, so someone who keeps one
 * for each provider, or several with different advanced options, had no record
 * of what they had already made — they rebuilt it to copy it again. This is
 * that record, kept only so it can be copied.
 *
 * It lives in this browser alone. The server still stores nothing, which is why
 * each entry can be forgotten on its own and the list is capped.
 */
type SavedLink = {
  name: string;
  link: string;
  target: string;
  /** What was ticked when this link was made, in the words the form uses. */
  options: string[];
  /** Enough to put the form back the way it was, so a record can be edited. */
  restore: {
    url: string;
    remoteConfigId: string;
    /* The id alone is not enough for a pasted config: "__custom__" says which
       field was in use, not what was typed into it. Without this, restoring
       such a record selected 自定义地址 with an empty box and then asked for a
       URL the record already had. */
    customRemoteConfig?: string;
    convertOptions: ConvertOptions;
  };
  createdAt: number;
};

const OPTION_LABELS: ReadonlyArray<[keyof ConvertOptions, string]> = [
  ["emoji", "Emoji 国旗"],
  ["udp", "UDP"],
  ["xudp", "XUDP"],
  ["tfo", "TFO"],
  ["tls13", "TLS 1.3"],
  ["sort", "节点排序"],
  ["autoUpdate", "自动更新"],
  ["filterUnsupported", "过滤不支持节点"],
  ["appendType", "显示协议类型"],
  ["skipCertVerify", "跳过证书验证"],
  ["singboxIpv6", "sing-box IPv6"],
];

/** The ticked options, named the way the form names them. */
export function describeOptions(options: ConvertOptions): string[] {
  const named = OPTION_LABELS.filter(([key]) => Boolean(options[key])).map(
    ([, label]) => label,
  );
  if (options.include) named.push("包含节点");
  if (options.exclude) named.push("排除节点");
  if (options.rename) named.push("重命名");
  if (options.customUserAgent) named.push("自定 UA");
  return named;
}

const OPTION_KEYS = Object.keys(RECOMMENDED_CONVERT_OPTIONS) as Array<
  keyof ConvertOptions
>;

const REPO_URL = "https://github.com/ZaunEkko/ekko-rules";

/* Two halves, joined only in the browser. The rendered page shows the words
   商务合作 and the server's HTML carries no address at all; a crawler would
   have to run the bundle to find one. It is not a secret — anyone who wants it
   can read it in the link — it just is not lying in the open. */
const CONTACT_MAILBOX = "work";
const CONTACT_DOMAIN = "zaunekko.com";

/**
 * The invitation to star, next to the buttons that finish the job.
 *
 * No page can star a repository for someone — that needs their GitHub login,
 * and from a third party an OAuth grant this site has no business asking for.
 * So it is a link, sitting in the space the actions leave rather than in a
 * banner of its own, and it asks once at the moment the work is done.
 */
function StarInvite({ stars }: { stars?: number | null }) {
  return (
    <a
      className="star-invite"
      href={REPO_URL}
      target="_blank"
      rel="noreferrer noopener"
      title="开源项目，欢迎到 GitHub 点亮 Star"
    >
      <span>欢迎 Star</span>
      {typeof stars === "number" ? <b>★ {stars}</b> : null}
    </a>
  );
}

type BaseUrlMode =
  | "localhost"
  | "current"
  | "detected"
  | "custom"
  | "history";

function parseBaseUrlMode(value: string | null): BaseUrlMode | null {
  if (
    value === "localhost" ||
    value === "current" ||
    value === "detected" ||
    value === "custom" ||
    value === "history"
  ) {
    return value;
  }
  return null;
}

function normalizeExportBaseUrl(value: string): string | null {
  try {
    const parsed = new URL(value.trim());
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.username ||
      parsed.password ||
      (parsed.pathname !== "/" && parsed.pathname !== "") ||
      parsed.search ||
      parsed.hash
    ) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

function appendBaseUrlHistory(current: string[], value: string): string[] {
  return current.includes(value) ? current : [...current, value].slice(-8);
}

function isLoopbackClientHost(hostname: string): boolean {
  const value = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return value === "localhost" || value === "127.0.0.1" || value === "::1";
}

function OptionToggle(props: {
  checked: boolean;
  title: string;
  description: string;
  onChange: (checked: boolean) => void;
  caution?: boolean;
  /** Marked on the few switches most people are better off turning on. */
  recommended?: boolean;
}) {
  return (
    <label className={`option-toggle ${props.caution ? "is-caution" : ""}`}>
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(event) => props.onChange(event.target.checked)}
      />
      <span className="switch-track" aria-hidden="true"><i /></span>
      <span className="option-copy">
        <strong>
          {props.title}
          {props.recommended ? <em className="option-hint">建议开启</em> : null}
        </strong>
        <small>{props.description}</small>
      </span>
    </label>
  );
}

function absoluteLocalUrl(path: string, preferredBaseUrl?: string): string {
  if (preferredBaseUrl) return new URL(path, preferredBaseUrl).toString();
  if (typeof window === "undefined") return path;
  return new URL(path, window.location.origin).toString();
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "刚刚创建";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

async function responseError(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as
    | { error?: string }
    | null;
  return payload?.error || `${fallback}（HTTP ${response.status}）`;
}

export function Workbench({
  initialCapabilities,
  initialStoresProfiles,
}: {
  initialCapabilities: Capabilities;
  initialStoresProfiles: boolean;
}) {
  const [subscriptionUrl, setSubscriptionUrl] = useState("");
  const [savedLinks, setSavedLinks] = useState<SavedLink[]>([]);
  const [profileName, setProfileName] = useState("");
  const [target, setTarget] = useState("clash");
  const [convertOptions, setConvertOptions] = useState<ConvertOptions>({
    ...RECOMMENDED_CONVERT_OPTIONS,
  });
  const [showUrl, setShowUrl] = useState(false);
  const [accessPassword, setAccessPassword] = useState("");
  const [health, setHealth] = useState<Health | null>(null);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(
    initialCapabilities,
  );
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profilesLoaded, setProfilesLoaded] = useState(false);
  const [createdProfile, setCreatedProfile] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [copying, setCopying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [runtimeOrigin, setRuntimeOrigin] = useState("");
  /* Assembled after mount so the address is never in the HTML this server
     sends. A crawler that does not run scripts finds nothing to harvest. */
  const [contactHref, setContactHref] = useState("");
  const [qrProfile, setQrProfile] = useState<Profile | null>(null);
  const [qrCopied, setQrCopied] = useState(false);
  const [shadowrocketQrStep, setShadowrocketQrStep] = useState<"home" | "config">("home");
  const [baseUrlOverride, setBaseUrlOverride] = useState("");
  const [baseUrlDraft, setBaseUrlDraft] = useState("");
  const [baseUrlError, setBaseUrlError] = useState<string | null>(null);
  const [baseUrlHistory, setBaseUrlHistory] = useState<string[]>([]);
  const [baseUrlMode, setBaseUrlMode] = useState<BaseUrlMode>("localhost");
  const [lanRefreshing, setLanRefreshing] = useState(false);
  const [revealLink, setRevealLink] = useState(false);
  const [remoteConfigId, setRemoteConfigId] = useState("ekko");
  const [customRemoteConfig, setCustomRemoteConfig] = useState("");

  const targets = capabilities?.supported_targets ?? FALLBACK_TARGETS;
  const selectedTarget =
    targets.find((item) => item.id === target) ?? targets[0];
  const mainstreamTargets = targets.filter((item) => item.tier === "mainstream");
  const compatibilityTargets = targets.filter(
    (item) => item.tier === "compatibility",
  );
  // Mihomo and sing-box expose a verified XUDP field. The native Shadowrocket
  // renderer deliberately does not advertise an unverified equivalent.
  const supportsXudp = target === "clash" || target === "singbox";
  const enabledOptionCount = countEnabledOptions({
    ...convertOptions,
    xudp: supportsXudp && convertOptions.xudp,
    singboxIpv6: target === "singbox" && convertOptions.singboxIpv6,
  });
  const engineOk = Boolean(health?.subconverter_reachable);
  // Two shapes only: the personal deployment stores fixed addresses, the open
  // one stores nothing and puts every choice in the visitor own link. Which
  // one this is comes from the server, so the first paint is already the right
  // page; health only keeps it current if the deployment is reconfigured.
  const storesProfiles = health
    ? health.stores_profiles !== false
    : initialStoresProfiles;
  const remoteConfigOptions = capabilities?.remote_configs ?? [];
  const allowCustomRemoteConfig = Boolean(capabilities?.allow_custom_remote_config);
  const usingCustomRemoteConfig = remoteConfigId === "__custom__";
  /* Whether this conversion's groups and rules come from somebody else.
     Keyed off the preset's own builtin flag rather than a list of ids: this
     repository publishes more than one build, and an operator can add presets
     of their own, which are third-party however they are labelled. A pasted
     URL is not in the list at all, so it warns too. */
  const usingThirdPartyRemoteConfig = !remoteConfigOptions.some(
    (option) => option.id === remoteConfigId && option.builtin,
  );
  const siteLinks = capabilities?.site_links ?? [];
  const statelessQuery = useMemo(() => {
    if (storesProfiles || !subscriptionUrl.trim()) return "";
    const remoteConfig = usingCustomRemoteConfig
      ? customRemoteConfig.trim()
      : remoteConfigId === "ekko"
        ? ""
        : remoteConfigId;
    return buildStatelessConvertQuery({
      subscriptionUrl,
      target: target as StatelessConvertRequest["target"],
      options: {
        ...convertOptions,
        xudp: supportsXudp && convertOptions.xudp,
        singboxIpv6: target === "singbox" && convertOptions.singboxIpv6,
      },
      name: profileName,
      remoteConfig,
    });
  }, [
    convertOptions,
    customRemoteConfig,
    profileName,
    remoteConfigId,
    storesProfiles,
    subscriptionUrl,
    supportsXudp,
    target,
    usingCustomRemoteConfig,
  ]);
  const sourceReady = Boolean(subscriptionUrl.trim());
  // One open deployment can answer on several domains. A visitor's link must
  // stay on the domain they actually opened, so the current origin wins there;
  // the personal shape keeps using its configured prefix.
  const defaultSubscriptionBaseUrl = storesProfiles
    ? health?.subscription_base_url || runtimeOrigin
    : runtimeOrigin || health?.subscription_base_url || "";
  const subscriptionBaseUrl =
    baseUrlOverride || defaultSubscriptionBaseUrl;
  const localhostBaseUrl = useMemo(() => {
    if (!runtimeOrigin) return "";
    const current = new URL(runtimeOrigin);
    current.hostname = "localhost";
    return current.origin;
  }, [runtimeOrigin]);
  /**
   * The address handed to another program rather than to a person.
   *
   * It points at `/i`, which answers a client with the configuration and a
   * browser with a page that opens the client. Most targets need one address;
   * Shadowrocket is handled separately as an ordered `.yaml` subscription and
   * `.conf` policy pair. Parameters still travel packed into one base64url
   * value so nested URLs survive.
   *
   * The link on the page, the one a person reads and copies, is untouched.
   */
  function clientHandoffUrl(
    subscriptionPath: string,
    forTarget = target,
    name = profileName.trim() || selectedTarget.short_label,
  ): string {
    const separator = subscriptionPath.indexOf("?");
    if (separator < 0) {
      return absoluteLocalUrl(subscriptionPath, subscriptionBaseUrl);
    }
    const packed = packStatelessQuery(subscriptionPath.slice(separator + 1));
    return absoluteLocalUrl(
      clientImportPath(forTarget, name, packed),
      subscriptionBaseUrl,
    );
  }

  /** Keep every installed address stable across repeats. */
  const qrAddressValue = qrProfile
    ? clientHandoffUrl(
        qrProfile.subscriptionPath,
        qrProfile.target,
        qrProfile.name,
      )
    : "";
  const qrShadowrocketAddresses = qrProfile?.target === "shadowrocket"
    ? shadowrocketImportAddresses(qrProfile, subscriptionBaseUrl)
    : null;
  const selectedScanAddress = qrShadowrocketAddresses
    ? qrShadowrocketAddresses[shadowrocketQrStep]
    : qrAddressValue;
  const qrValue = qrProfile
    ? qrCodeValue(qrProfile.target, selectedScanAddress, qrProfile.name)
    : "";
  const currentProfileName =
    profileName.trim() || selectedTarget.short_label;
  const currentShadowrocketAddresses = sourceReady && target === "shadowrocket"
    ? shadowrocketImportAddresses(
        {
          id: "stateless",
          name: currentProfileName,
          target,
          createdAt: "",
          subscriptionPath: `/sub?${statelessQuery}`,
          downloadPath: "",
          enabledOptionCount,
        },
        subscriptionBaseUrl,
      )
    : null;
  const currentInstallAddress = currentShadowrocketAddresses?.home ??
    (sourceReady ? clientHandoffUrl(`/sub?${statelessQuery}`) : "");
  const currentInstallValue = sourceReady
    ? qrImportValue(
        target,
        currentInstallAddress,
        "install",
        currentProfileName,
      )
    : "";
  const currentShadowrocketConfigInstallValue = currentShadowrocketAddresses
    ? shadowrocketConfigImportValue(currentShadowrocketAddresses.config)
    : "";
  const selectedShadowrocketInstallValue = qrShadowrocketAddresses
    ? shadowrocketQrStep === "home"
      ? qrImportValue("shadowrocket", qrShadowrocketAddresses.home, "install")
      : shadowrocketConfigImportValue(qrShadowrocketAddresses.config)
    : "";
  const createdShadowrocketAddresses = createdProfile?.target === "shadowrocket"
    ? shadowrocketImportAddresses(createdProfile, subscriptionBaseUrl)
    : null;
  const createdShadowrocketHomeInstallValue = createdShadowrocketAddresses
    ? qrImportValue(
        "shadowrocket",
        createdShadowrocketAddresses.home,
        "install",
        createdProfile?.name ?? "",
      )
    : "";
  const createdShadowrocketConfigInstallValue = createdShadowrocketAddresses
    ? shadowrocketConfigImportValue(createdShadowrocketAddresses.config)
    : "";

  // The link is the product, so it reads the way a config file does: one
  // parameter per line, coloured by what that parameter decides.
  const linkSegments = useMemo(() => {
    if (!statelessQuery) return [] as Array<{ key: string; value: string }>;
    return statelessQuery.split("&").map((pair) => {
      const separator = pair.indexOf("=");
      const key = separator < 0 ? pair : pair.slice(0, separator);
      const raw = separator < 0 ? "" : pair.slice(separator + 1);
      let value = raw;
      try {
        value = decodeURIComponent(raw);
      } catch {
        value = raw;
      }
      return { key, value };
    });
  }, [statelessQuery]);

  const loadProfiles = useCallback(async () => {
    setProfileBusy(true);
    setProfileError(null);
    try {
      const response = await fetch("/api/profiles", {
        cache: "no-store",
        headers: accessPassword
          ? { "x-ekko-access-password": accessPassword }
          : undefined,
      });
      if (!response.ok) {
        throw new Error(await responseError(response, "读取失败"));
      }
      const payload = (await response.json()) as { profiles: Profile[] };
      setProfiles(payload.profiles);
      setProfilesLoaded(true);
    } catch (nextError) {
      setProfileError(
        nextError instanceof Error ? nextError.message : "无法读取本地订阅",
      );
    } finally {
      setProfileBusy(false);
    }
  }, [accessPassword]);

  // Restore a previously used address once, on mount. A private window, cleared
  // site data, or a browser that refuses storage all land in the catch and the
  // page simply starts empty, which is the same state a first visit has.
  const writeSavedLinks = useCallback((next: SavedLink[]) => {
    setSavedLinks(next);
    try {
      if (next.length) {
        window.localStorage.setItem(SOURCE_HISTORY_KEY, JSON.stringify(next));
      } else {
        window.localStorage.removeItem(SOURCE_HISTORY_KEY);
      }
    } catch {
      /* storage unavailable; the list simply does not survive this visit */
    }
  }, []);

  // Restore once on mount. A private window, cleared site data, or a browser
  // that refuses storage all land in the catch, and the page starts empty —
  // the same state a first visit has.
  useEffect(() => {
    try {
      const parsed: unknown = JSON.parse(
        window.localStorage.getItem(SOURCE_HISTORY_KEY) || "[]",
      );
      if (!Array.isArray(parsed)) return;
      const entries = dedupeSavedLinks(
        parsed.filter(
          (entry): entry is SavedLink =>
            Boolean(entry) &&
            typeof entry === "object" &&
            typeof (entry as SavedLink).link === "string" &&
            (entry as SavedLink).link.startsWith("http"),
        ),
      ).slice(0, SAVED_LINK_LIMIT);
      if (entries.length) setSavedLinks(entries);
    } catch {
      /* unreadable or absent; start empty */
    }
  }, []);

  const rememberLink = useCallback(
    (
      link: string,
      forTarget: string,
      options: ConvertOptions,
      name: string,
      restore: SavedLink["restore"],
    ) => {
      const value = link.trim();
      if (!value.startsWith("http")) return;
      const nextEntry: SavedLink = {
        name: name.trim() || `记录 ${savedLinks.length + 1}`,
        link: value,
        target: forTarget,
        options: describeOptions(options),
        restore,
        createdAt: Date.now(),
      };
      const identity = savedLinkIdentity(nextEntry);
      writeSavedLinks(
        [
          nextEntry,
          ...savedLinks.filter(
            (entry) => savedLinkIdentity(entry) !== identity,
          ),
        ].slice(0, SAVED_LINK_LIMIT),
      );
    },
    [savedLinks, writeSavedLinks],
  );

  /** Put the form back where it was, so a record can be adjusted rather than rebuilt. */
  const restoreLink = useCallback((entry: SavedLink) => {
    if (!entry.restore) return;
    setSubscriptionUrl(entry.restore.url);
    setCustomRemoteConfig(entry.restore.customRemoteConfig ?? "");
    setTarget(entry.target);
    setRemoteConfigId(entry.restore.remoteConfigId);
    setConvertOptions({
      ...RECOMMENDED_CONVERT_OPTIONS,
      ...entry.restore.convertOptions,
    });
    setProfileName(entry.name);
  }, []);

  /**
   * Put the form back to how it opens.
   *
   * Restoring a record overwrites every field at once, and without this there
   * was no way out of it: someone who opened an old record to look at it was
   * left holding it. This clears the form only — the records themselves stay,
   * because wanting a blank form is not wanting to lose them.
   */
  const resetForm = useCallback(() => {
    setSubscriptionUrl("");
    setProfileName("");
    setTarget("clash");
    setRemoteConfigId("ekko");
    setCustomRemoteConfig("");
    setConvertOptions({ ...RECOMMENDED_CONVERT_OPTIONS });
  }, []);

  const formTouched =
    subscriptionUrl !== "" ||
    profileName !== "" ||
    target !== "clash" ||
    remoteConfigId !== "ekko" ||
    OPTION_KEYS.some(
      (key) => convertOptions[key] !== RECOMMENDED_CONVERT_OPTIONS[key],
    );

  const forgetLink = useCallback(
    (link: string) => {
      writeSavedLinks(savedLinks.filter((entry) => entry.link !== link));
    },
    [savedLinks, writeSavedLinks],
  );

  useEffect(() => {
    setRuntimeOrigin(window.location.origin);
    setContactHref(`mailto:${CONTACT_MAILBOX}@${CONTACT_DOMAIN}`);
    const saved = window.localStorage.getItem(BASE_URL_STORAGE_KEY);
    const normalized = saved ? normalizeExportBaseUrl(saved) : null;
    if (normalized) {
      setBaseUrlOverride(normalized);
      setBaseUrlDraft(normalized);
    }
    setBaseUrlMode(
      parseBaseUrlMode(window.localStorage.getItem(BASE_URL_MODE_KEY)) ||
        (isLoopbackClientHost(window.location.hostname)
          ? "localhost"
          : "current"),
    );
    try {
      const values = JSON.parse(
        window.localStorage.getItem(BASE_URL_HISTORY_KEY) || "[]",
      ) as unknown;
      if (Array.isArray(values)) {
        const valid = values
          .flatMap((value) =>
            typeof value === "string"
              ? [normalizeExportBaseUrl(value)].filter(
                  (item): item is string => Boolean(item),
                )
              : [],
          )
          .filter((value, index, all) => all.indexOf(value) === index)
          .slice(0, 8);
        setBaseUrlHistory(valid);
      }
    } catch {
      window.localStorage.removeItem(BASE_URL_HISTORY_KEY);
    }
  }, []);

  useEffect(() => {
    if (!baseUrlDraft && defaultSubscriptionBaseUrl) {
      setBaseUrlDraft(defaultSubscriptionBaseUrl);
    }
  }, [baseUrlDraft, defaultSubscriptionBaseUrl]);

  useEffect(() => {
    let cancelled = false;

    async function loadRuntimeStatus() {
      try {
        const [healthResponse, capabilitiesResponse] = await Promise.all([
          fetch("/api/health", { cache: "no-store" }),
          fetch("/api/capabilities", { cache: "no-store" }),
        ]);
        if (!healthResponse.ok || !capabilitiesResponse.ok) {
          throw new Error("Local service status is unavailable.");
        }
        const [nextHealth, nextCapabilities] = await Promise.all([
          healthResponse.json() as Promise<Health>,
          capabilitiesResponse.json() as Promise<Capabilities>,
        ]);
        if (!cancelled) {
          setHealth(nextHealth);
          setCapabilities(nextCapabilities);
        }
      } catch {
        if (!cancelled) setHealth(null);
      }
    }

    void loadRuntimeStatus();

    // An open station can have many tabs sitting idle in the background; none
    // of them needs to keep asking. Polling stops while the tab is hidden and
    // refreshes once as soon as it comes back.
    let timer: number | null = null;
    const start = () => {
      if (timer === null) timer = window.setInterval(loadRuntimeStatus, 15_000);
    };
    const stop = () => {
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void loadRuntimeStatus();
        start();
      } else {
        stop();
      }
    };
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    if (baseUrlMode !== "detected") return;
    const detected = health?.detected_lan_base_url
      ? normalizeExportBaseUrl(health.detected_lan_base_url)
      : null;
    if (!detected || detected === baseUrlOverride) return;

    setBaseUrlDraft(detected);
    setBaseUrlOverride(detected);
    setBaseUrlError(null);
    window.localStorage.setItem(BASE_URL_STORAGE_KEY, detected);
    window.localStorage.setItem(BASE_URL_MODE_KEY, "detected");
    setBaseUrlHistory((current) => {
      const next = appendBaseUrlHistory(current, detected);
      window.localStorage.setItem(BASE_URL_HISTORY_KEY, JSON.stringify(next));
      return next;
    });
  }, [baseUrlMode, baseUrlOverride, health?.detected_lan_base_url]);

  // One count per session, and — because status polling hands this effect a
  // fresh object every 15 seconds — at most one per mount even where session
  // storage is unavailable.
  const visitReported = useRef(false);
  const metricsAvailable = Boolean(health?.metrics);
  useEffect(() => {
    if (!metricsAvailable || visitReported.current) return;
    visitReported.current = true;
    const KEY = "ekko-rules.visit-counted";
    try {
      if (window.sessionStorage.getItem(KEY)) return;
      window.sessionStorage.setItem(KEY, "1");
    } catch {
      // A browser that refuses site data counts once per page load instead.
    }
    void fetch("/api/metrics/visit", { method: "POST", cache: "no-store" }).catch(
      () => undefined,
    );
  }, [metricsAvailable]);

  useEffect(() => {
    if (health?.stores_profiles === false) return;
    if (health && !health.access_password_required && !profilesLoaded) {
      void loadProfiles();
    }
  }, [health, loadProfiles, profilesLoaded]);

  const profileCountLabel = useMemo(() => {
    if (!profilesLoaded) return "等待读取";
    return `${profiles.length} 个固定地址`;
  }, [profiles.length, profilesLoaded]);

  function buildStatelessProfile(): Profile {
    const path = `/sub?${statelessQuery}`;
    return {
      id: "stateless",
      name: profileName.trim() || `${selectedTarget?.short_label ?? target} 订阅`,
      target,
      createdAt: new Date().toISOString(),
      subscriptionPath: path,
      downloadPath: path,
      enabledOptionCount,
    };
  }

  /**
   * Every way of taking a link away counts as having made it.
   *
   * The record used to be written only by the copy button, so someone who
   * imported in one tap, or scanned the code with a phone, came back to an
   * empty list and had to rebuild the link to see it again. Copy, scan and
   * one-tap import now leave the same record.
   */
  function recordCurrentLink(profile: Profile = buildStatelessProfile()): Profile {
    rememberLink(
      absoluteLocalUrl(profile.subscriptionPath, subscriptionBaseUrl),
      target,
      convertOptions,
      profileName || selectedTarget.short_label,
      {
        url: subscriptionUrl,
        remoteConfigId,
        customRemoteConfig,
        convertOptions,
      },
    );
    return profile;
  }

  async function createProfile(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    // Nothing is stored on an open deployment, so the link is assembled in the
    // browser and never leaves it until the user shares it themselves.
    if (!storesProfiles) {
      if (usingCustomRemoteConfig && !customRemoteConfig.trim()) {
        setError("请填写远程配置地址，或改回内置选项。");
        return;
      }
      const profile = recordCurrentLink();
      setCreatedProfile(profile);
      openQr(profile);
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/profiles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          name: profileName || undefined,
          subscriptionUrl,
          target,
          options: convertOptions,
          accessPassword: accessPassword || undefined,
        }),
      });
      if (!response.ok) {
        throw new Error(await responseError(response, "创建失败"));
      }
      const payload = (await response.json()) as { profile: Profile };
      setCreatedProfile(payload.profile);
      openQr(payload.profile);
      setProfiles((current) => [
        payload.profile,
        ...current.filter((item) => item.id !== payload.profile.id),
      ]);
      setProfilesLoaded(true);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "创建失败");
    } finally {
      setBusy(false);
    }
  }

  function openQr(profile: Profile) {
    setQrCopied(false);
    setShadowrocketQrStep("home");
    setQrProfile(profile);
  }

  function renderCurrentInstallActions() {
    if (!sourceReady || !supportsClientInstallQr(target)) return null;
    if (target === "shadowrocket") {
      return (
        <>
          <a
            className="open-action is-primary"
            href={currentInstallValue}
            onClick={() => recordCurrentLink()}
          >
            ① 导入节点订阅
          </a>
          <a
            className="open-action"
            href={currentShadowrocketConfigInstallValue}
            onClick={() => recordCurrentLink()}
          >
            ② 导入分流配置
          </a>
        </>
      );
    }
    return (
      <a
        className="open-action is-primary"
        href={currentInstallValue}
        onClick={() => recordCurrentLink()}
      >
        {clientInstallLabel(target)}
      </a>
    );
  }

  function renderShadowrocketImportNotice() {
    if (target !== "shadowrocket") return null;
    return (
      <p className="shadowrocket-import-notice" role="note">
        <strong>Shadowrocket 必须导入两次，顺序不要反：</strong>
        先用 ① 建立节点订阅，再用 ② 加载分流规则。配置模式默认通过原生 PROXY 使用首页当前节点，也会把首页全部节点加入各策略组供单独选择；DIRECT / REJECT 按规则生效。
      </p>
    );
  }

  async function copyText(value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const input = document.createElement("textarea");
      input.value = value;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
  }

  async function copyUrl(profile: Profile) {
    await copyText(absoluteLocalUrl(profile.subscriptionPath, subscriptionBaseUrl));
    setCopying(profile.id);
    window.setTimeout(() => setCopying(null), 1600);
  }

  async function deleteProfile(profile: Profile) {
    if (!window.confirm(`删除“${profile.name}”的本地订阅地址？`)) return;
    setProfileError(null);
    try {
      const response = await fetch(`/api/profiles/${encodeURIComponent(profile.id)}`, {
        method: "DELETE",
        headers: accessPassword
          ? { "x-ekko-access-password": accessPassword }
          : undefined,
      });
      if (!response.ok) {
        throw new Error(await responseError(response, "删除失败"));
      }
      setProfiles((current) => current.filter((item) => item.id !== profile.id));
      if (createdProfile?.id === profile.id) setCreatedProfile(null);
      if (qrProfile?.id === profile.id) setQrProfile(null);
    } catch (nextError) {
      setProfileError(nextError instanceof Error ? nextError.message : "删除失败");
    }
  }

  function applyBaseUrlPrefix(
    value = baseUrlDraft,
    mode: BaseUrlMode = "custom",
  ) {
    const normalized = normalizeExportBaseUrl(value);
    if (!normalized) {
      setBaseUrlError("请输入不带路径的 http(s) 地址，例如 http://192.168.1.100:8787");
      return;
    }
    setBaseUrlDraft(normalized);
    setBaseUrlOverride(normalized);
    setBaseUrlMode(mode);
    setBaseUrlError(null);
    window.localStorage.setItem(BASE_URL_STORAGE_KEY, normalized);
    window.localStorage.setItem(BASE_URL_MODE_KEY, mode);
    setBaseUrlHistory((current) => {
      const next = appendBaseUrlHistory(current, normalized);
      window.localStorage.setItem(BASE_URL_HISTORY_KEY, JSON.stringify(next));
      return next;
    });
  }

  function useCurrentAccessAddress() {
    if (!runtimeOrigin) return;
    setBaseUrlDraft(runtimeOrigin);
    applyBaseUrlPrefix(runtimeOrigin, "current");
  }

  function useLocalhostAddress() {
    if (!localhostBaseUrl) return;
    setBaseUrlDraft(localhostBaseUrl);
    applyBaseUrlPrefix(localhostBaseUrl, "localhost");
  }

  async function refreshLanAddress() {
    setLanRefreshing(true);
    setBaseUrlError(null);
    try {
      const response = await fetch(`/api/health?refresh=${Date.now()}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(await responseError(response, "自动识别失败"));
      }
      const nextHealth = (await response.json()) as Health;
      setHealth(nextHealth);
      const current = runtimeOrigin ? new URL(runtimeOrigin) : null;
      const detected =
        nextHealth.detected_lan_base_url ||
        (current && !isLoopbackClientHost(current.hostname)
          ? current.origin
          : "");
      if (!detected) {
        setBaseUrlError(
          "尚未收到宿主机局域网地址。Windows 请先运行一次 setup.cmd，或暂时手动填写电脑 IP。",
        );
        return;
      }
      setBaseUrlDraft(detected);
      applyBaseUrlPrefix(detected, "detected");
    } catch (nextError) {
      setBaseUrlError(
        nextError instanceof Error ? nextError.message : "自动识别局域网地址失败",
      );
    } finally {
      setLanRefreshing(false);
    }
  }

  return (
    <main className="page-shell" data-shell={storesProfiles ? "local" : "open"}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            E<i />
          </span>
          <div className="brand-copy">
            <strong>{storesProfiles ? "Ekko Rules Local" : "Ekko Rules"}</strong>
            <span>{storesProfiles ? "私有订阅工作台" : "订阅转换"}</span>
          </div>
        </div>
        {siteLinks.length ? (
          <nav className="top-links" aria-label="项目链接">
            {siteLinks.map((link) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noreferrer noopener"
              >
                <SiteMark url={link.url} />
                <span className="top-link-label">{link.label}</span>
              </a>
            ))}
            {/* Anyone with a proposal reaches it in one click, and the address
                itself stays out of the page text. */}
            <a
              className="top-link-contact"
              href={contactHref || undefined}
              title="合作 · 推广 · 赞助"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinejoin="round"
                  d="M1.9 3.4h12.2v9.2H1.9z"
                />
                <path
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m2.4 4.1 5.6 4.3 5.6-4.3"
                />
              </svg>
              <span>商务合作</span>
            </a>
          </nav>
        ) : null}

        <div className="runtime-status" aria-live="polite">
          <span className={`status-dot ${engineOk ? "is-ok" : ""}`} />
          <strong>
            {health === null
              ? "正在连接"
              : engineOk
                ? "引擎已就绪"
                : "引擎未就绪"}
          </strong>
          {/* The rules version is baked into the image at build time from the
              release tag, so what this prints is the corpus the server is
              actually serving — not what the repository currently holds. A
              visitor who reads the routing notes has no other way to tell
              whether this deployment has caught up with them. */}
          {/* Saying which version runs here only answers half the question a
              visitor has. A tag can be published minutes before this server
              pulls it, and without the comparison the only way to tell was to
              open GitHub.

              This used to print nothing extra when the deployment was current,
              on the reasoning that "up to date" is not news. That was wrong:
              silence when current is indistinguishable from never having
              checked, so a visitor still could not trust the number. It now
              always says what the check found, and says nothing only when the
              lookup itself failed — which is the one case where there is
              genuinely nothing to report. */}
          {/* Two numbers, because they are two things. The rules and the
              site are released on separate tags: a site release changes
              nothing about what gets matched, and printing one number for
              both told visitors their rules had changed when they had not.
              The rules version comes from the engine itself, so it is what is
              running rather than what this image was built beside. */}
          <code
            title={
              health?.rules_update_available
                ? `服务器规则 ${health.rules_version}，最新为 ${health.latest_rules_version}，镜像尚未拉取`
                : health?.latest_rules_version
                  ? `已是最新发布的规则版本（${health.latest_rules_version}）`
                  : "服务器当前运行的规则版本"
            }
            data-stale={health?.rules_update_available ? "true" : undefined}
          >
            规则 {health?.rules_version ?? "—"}
            {/* Always says what the check found. Printing nothing when current
                is indistinguishable from never having checked, and then the
                number on the left cannot be trusted either — which is the
                whole reason the check exists. Silence is kept for the one case
                where there is genuinely nothing to report: the lookup failed. */}
            {health?.latest_rules_version ? (
              <>
                {" · 最新 "}
                <b className="version-latest">{health.latest_rules_version}</b>
              </>
            ) : null}
          </code>
          <code
            title={
              health?.site_update_available
                ? `站点 ${health.site_version}，最新为 ${health.latest_site_version}，镜像尚未拉取`
                : health?.latest_site_version
                  ? `已是最新发布的站点版本（${health.latest_site_version}）`
                  : "这个站点自己的版本"
            }
            data-stale={health?.site_update_available ? "true" : undefined}
          >
            站点 {health?.site_version ?? "—"}
            {health?.latest_site_version ? (
              <>
                {" · 最新 "}
                <b className="version-latest">{health.latest_site_version}</b>
              </>
            ) : null}
          </code>
        </div>

      </header>

      <section className="workbench">
        {health?.deployment_error ? (
          <div className="message is-error" role="alert">
            管理接口已锁定：{health.deployment_error}
          </div>
        ) : null}
        {health?.deployment_warning ? (
          <div className="message is-error" role="alert">
            {health.deployment_warning}
          </div>
        ) : null}
        {storesProfiles ? (
          <>
        <div className="intro-row">
          <div className="intro-copy">
            <p className="kicker">本地自托管 · 订阅不出这台机器</p>
            <h1>
              <span>导入一次，</span>
              <em>以后原地址更新。</em>
            </h1>
            <p>
              真实订阅只交给本机 Docker，换回一个固定的本地地址。客户端导入这一次；以后启动服务，刷新同一个地址就有新节点。
            </p>
          </div>
          <div className="privacy-seal">
            <span className="seal-icon" aria-hidden="true"><i /></span>
            <div>
              <strong>不经过第三方</strong>
              <span>真实订阅只写在本机的 Docker 数据卷里，生成结果不留存</span>
            </div>
          </div>
        </div>

        <div className="route-strip" aria-label="本地订阅工作流程">
          <div className={`route-step ${sourceReady ? "is-ready" : ""}`}>
            <span className="step-number">01</span>
            <div>
              <strong>真实订阅</strong>
              <small>仅本机保存</small>
            </div>
          </div>
          <span className="route-link" aria-hidden="true" />
          <div className={`route-step ${engineOk ? "is-ready" : ""} ${busy ? "is-active" : ""}`}>
            <span className="step-number">02</span>
            <div><strong>完整配置</strong><small>DNS + 策略组 + 规则</small></div>
          </div>
          <span className="route-link" aria-hidden="true" />
          <div className={`route-step ${createdProfile ? "is-ready" : ""}`}>
            <span className="step-number">03</span>
            <div>
              <strong>固定地址</strong>
              <small>客户端导入一次</small>
            </div>
          </div>
        </div>
          </>
        ) : (
          <section className="open-hero" aria-labelledby="open-hero-title">
            <div className="open-hero-copy">
              <p className="open-eyebrow">开放转换 · 什么都不留</p>
              <h1 id="open-hero-title">
                <span>把订阅换成</span>
                <em>整份配置。</em>
              </h1>
              <p className="open-lede">
                节点、DNS、策略组、规则，一个文件全给你。链接在你的浏览器里拼成，
                服务器不保存订阅，也不知道你生成过什么。
              </p>
            </div>

            <div
              className="open-link"
              data-ready={sourceReady ? "true" : "false"}
              aria-live="polite"
            >
              <div className="open-link-head">
                <span className="open-link-label">你的订阅链接</span>
                <button
                  type="button"
                  className="open-link-reveal"
                  onClick={() => setRevealLink((current) => !current)}
                  disabled={!sourceReady}
                >
                  {revealLink ? "隐藏订阅地址" : "显示订阅地址"}
                </button>
              </div>

              <code className="open-link-body">
                <span className="open-link-origin">
                  {(subscriptionBaseUrl || "https://本站地址") + "/sub"}
                </span>
                {linkSegments.length ? (
                  linkSegments.map((segment, index) => (
                    <span
                      className="open-link-param"
                      data-role={
                        segment.key === "url"
                          ? "secret"
                          : segment.key === "target" || segment.key === "config"
                            ? "route"
                            : "tune"
                      }
                      key={segment.key}
                    >
                      <i>
                        {index === 0 ? "?" : "&"}
                        {segment.key}=
                      </i>
                      <b>
                        {segment.key === "url" && !revealLink
                          ? "••••••••••••••••••••"
                          : segment.value}
                      </b>
                    </span>
                  ))
                ) : (
                  <span className="open-link-ghost">
                    <i>?url=</i>
                    <b>粘贴订阅地址后，这里会当场拼出来</b>
                  </span>
                )}
              </code>

              <div className="open-link-actions">
                {/* Clients that register a scheme can take the subscription in
                    one tap; the rest fall back to copying. */}
                {renderCurrentInstallActions()}
                <button
                  type="button"
                  className={`open-action ${
                    sourceReady && supportsClientInstallQr(target) ? "" : "is-primary"
                  }`}
                  disabled={!sourceReady}
                  onClick={() => void copyUrl(recordCurrentLink())}
                >
                  {copying === "stateless" ? "已复制" : "复制链接"}
                </button>
                <button
                  type="button"
                  className="open-action"
                  disabled={!sourceReady}
                  onClick={() => openQr(recordCurrentLink())}
                >
                  扫码导入
                </button>
                <StarInvite stars={health?.repo_stars} />
              </div>
              {renderShadowrocketImportNotice()}
              {savedLinks.length ? (
                <div className="saved-links">
                  <p className="saved-links-title">
                    这台设备上生成过的链接
                    <small>只存在本浏览器，服务器不知道</small>
                    {formTouched ? (
                      <button
                        type="button"
                        className="saved-links-reset"
                        onClick={resetForm}
                        title="清空上面的表单，记录不会删除"
                      >
                        重新配置
                      </button>
                    ) : null}
                  </p>
                  <ul>
                    {savedLinks.map((entry) => (
                      <li key={entry.link}>
                        <button
                          type="button"
                          className="saved-link-copy"
                          onClick={() => restoreLink(entry)}
                          title="填回上面的表单，接着改"
                        >
                          <strong>{entry.name}</strong>
                          {/* Only what was actually ticked. Saying nothing was
                              ticked is noise: the absence already shows. */}
                          <span>
                            {[entry.target, ...entry.options].join(" · ")}
                          </span>
                        </button>
                        <div className="saved-link-actions">
                          <button
                            type="button"
                            onClick={() => void navigator.clipboard.writeText(entry.link)}
                          >
                            复制
                          </button>
                          <button type="button" onClick={() => forgetLink(entry.link)}>
                            删除
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {/* Clients ship switches that rewrite an imported profile —
                  a DNS override, smart group selection, global merge/script
                  hooks. Each one silently replaces part of what was just
                  generated, and the routing depends on those parts. Say so
                  where the import happens. */}
              <p className="open-client-note">
                <b>客户端里会改写配置的开关，不懂就别动。</b>
                「DNS 覆写」「Smart 内核 / 智能分组」「全局扩展脚本」这些都会改掉你刚
                导入的这份配置——DNS、策略组、分流规则这边都配好了，保持关闭即可。
                确实清楚自己在调什么再接管。
              </p>
            </div>

            <dl className="open-facts">
              {/* This used to read "留下的订阅 0 条" as a claim about the
                  server. Standing next to a list of local records it read as a
                  contradiction instead, so it now counts what is actually
                  there. That the server keeps nothing is said in the hero and
                  again in the footer, where it is a promise rather than a
                  counter. */}
              <div data-role="direct">
                <dt>本机记录</dt>
                <dd>{savedLinks.length} 条</dd>
              </div>
              <div data-role="proxy">
                <dt>可选规则</dt>
                <dd>{remoteConfigOptions.length} 套</dd>
              </div>
              <div data-role="proxy">
                <dt>客户端格式</dt>
                <dd>{targets.length} 种</dd>
              </div>
              {health?.metrics ? (
                <>
                  <div>
                    <dt>今日拉取</dt>
                    <dd><Tally value={health.metrics.conversions_today} /></dd>
                  </div>
                  <div>
                    <dt>累计拉取</dt>
                    <dd><Tally value={health.metrics.conversions_total} /></dd>
                  </div>
                  <div>
                    <dt>今日访问</dt>
                    <dd><Tally value={health.metrics.visits_today} /></dd>
                  </div>
                  <div>
                    <dt>累计访问</dt>
                    <dd><Tally value={health.metrics.visits_total} /></dd>
                  </div>
                </>
              ) : null}
            </dl>
          </section>
        )}

        <div className="content-grid">
          <form className="profile-form" onSubmit={createProfile}>
            <div className="section-heading">
              <div>
                <p className="section-label">
                  {storesProfiles ? "CREATE LOCAL PROFILE" : "BUILD YOUR LINK"}
                </p>
                <h2>{storesProfiles ? "创建本地订阅" : "生成订阅链接"}</h2>
              </div>
              <span className="format-badge">{targets.length} 种格式</span>
            </div>

            <label className="field" htmlFor="subscription-url">
              <span className="field-label">
                <strong>填写你的机场订阅</strong>
                <small>
                  {storesProfiles
                    ? "不会出现在生成的本地 URL 中"
                    : "会写进生成的链接，请勿把链接分享给他人"}
                </small>
              </span>
              <span className="input-shell has-action">
                <input
                  id="subscription-url"
                  className="control control-mono"
                  value={subscriptionUrl}
                  onChange={(event) => setSubscriptionUrl(event.target.value)}
                  type={showUrl ? "url" : "password"}
                  autoComplete="off"
                  spellCheck={false}
                  required
                  placeholder="https://provider.example/subscription"
                />
                <button
                  type="button"
                  className="field-action"
                  onClick={() => setShowUrl((value) => !value)}
                >
                  {showUrl ? "隐藏" : "显示"}
                </button>
              </span>
            </label>

            <div className="form-row">
              <label className="field" htmlFor="profile-name">
                <span className="field-label"><strong>名称</strong><small>选填</small></span>
                <span className="input-shell">
                  <input
                    id="profile-name"
                    className="control"
                    value={profileName}
                    onChange={(event) => setProfileName(event.target.value)}
                    maxLength={50}
                    placeholder="例如：手机主力订阅"
                  />
                </span>
              </label>

              {storesProfiles ? (
              <label className="field" htmlFor="target-format">
                <span className="field-label"><strong>输出客户端</strong><small>完整配置</small></span>
                <span className="input-shell select-shell">
                  <select
                    id="target-format"
                    className="control"
                    value={target}
                    onChange={(event) => setTarget(event.target.value)}
                  >
                    <optgroup label="主流客户端">
                      {mainstreamTargets.map((item) => (
                        <option value={item.id} key={item.id}>{item.label}</option>
                      ))}
                    </optgroup>
                    {compatibilityTargets.length ? (
                      <optgroup label="更多兼容格式">
                        {compatibilityTargets.map((item) => (
                          <option value={item.id} key={item.id}>{item.label}</option>
                        ))}
                      </optgroup>
                    ) : null}
                  </select>
                </span>
              </label>
              ) : null}
            </div>

            {storesProfiles ? null : (
              <div className="field target-field">
                <span className="field-label">
                  <strong>输出客户端</strong>
                  <small>每种都是完整配置，不是裸节点列表</small>
                </span>
                <div className="target-grid" role="radiogroup" aria-label="输出客户端">
                  {targets.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      role="radio"
                      aria-checked={target === item.id}
                      className="target-chip"
                      data-tier={item.tier}
                      onClick={() => setTarget(item.id)}
                    >
                      <strong>{item.short_label}</strong>
                      <small>{item.extension.toUpperCase()}</small>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {health?.access_password_required ? (
              <div className="password-row">
                <label className="field" htmlFor="access-password">
                  <span className="field-label"><strong>本地访问密码</strong></span>
                  <span className="input-shell">
                    <input
                      id="access-password"
                      className="control"
                      type="password"
                      value={accessPassword}
                      onChange={(event) => setAccessPassword(event.target.value)}
                      autoComplete="current-password"
                      required
                    />
                  </span>
                </label>
                <button
                  type="button"
                  className="secondary-button unlock-button"
                  onClick={() => void loadProfiles()}
                  disabled={profileBusy || !accessPassword}
                >
                  {profileBusy ? "读取中" : "读取已保存地址"}
                </button>
              </div>
            ) : null}

            {storesProfiles ? (
              <>
            <div className="target-note">
              <div>
                <span className="target-icon">{selectedTarget.short_label.slice(0, 1)}</span>
                <div>
                  <strong>{selectedTarget.label}</strong>
                  <span>{selectedTarget.client_family}</span>
                </div>
              </div>
              {selectedTarget.id === "shadowrocket" ? (
                <span className="recommend-chip">原生导入已实测</span>
              ) : selectedTarget.verified_modern_protocols.length >= 4 ? (
                <span className="recommend-chip">现代协议已验证</span>
              ) : (
                <span className="compatibility-chip">依客户端能力输出</span>
              )}
            </div>

            <div className="protocol-note">
              <span className="protocol-mark" aria-hidden="true">AUTO</span>
              <div>
                <strong>协议自动识别，不需要手动选择</strong>
                <span>{selectedTarget.protocol_note}</span>
              </div>
            </div>
              </>
            ) : null}

            <details className="advanced-panel">
              <summary>
                <span>
                  <strong>高级选项</strong>
                  <small>
                    {storesProfiles
                      ? "随固定地址保存，每次刷新继续生效"
                      : "写进链接本身，每次刷新继续生效"}
                  </small>
                </span>
                <span className="advanced-count">{enabledOptionCount} 项启用</span>
              </summary>

              <div className="advanced-body">
                <div className="option-grid">
                  <OptionToggle
                    checked={convertOptions.emoji}
                    title="Emoji 国旗"
                    recommended
                    description="按节点地区补充旗帜"
                    onChange={(emoji) =>
                      setConvertOptions((current) => ({ ...current, emoji }))
                    }
                  />
                  <OptionToggle
                    checked={convertOptions.udp}
                    title="启用 UDP"
                    recommended
                    description="为目标支持的节点强制开启"
                    onChange={(udp) =>
                      setConvertOptions((current) => ({ ...current, udp }))
                    }
                  />
                  {supportsXudp ? (
                    <OptionToggle
                      checked={convertOptions.xudp}
                      title="强制 XUDP"
                      recommended
                      description="仅 VLESS / VMess；关闭时自动判断"
                      onChange={(xudp) =>
                        setConvertOptions((current) => ({ ...current, xudp }))
                      }
                    />
                  ) : null}
                  <OptionToggle
                    checked={convertOptions.tfo}
                    title="启用 TFO"
                    description="为兼容协议开启 TCP Fast Open"
                    onChange={(tfo) =>
                      setConvertOptions((current) => ({ ...current, tfo }))
                    }
                  />
                  <OptionToggle
                    checked={convertOptions.tls13}
                    title="TLS 1.3"
                    description="在支持的输出格式中启用"
                    onChange={(tls13) =>
                      setConvertOptions((current) => ({ ...current, tls13 }))
                    }
                  />
                  <OptionToggle
                    checked={convertOptions.sort}
                    title="节点排序"
                    description="开启后按名称重排；关闭则保留机场原始顺序"
                    onChange={(sort) =>
                      setConvertOptions((current) => ({ ...current, sort }))
                    }
                  />
                  <OptionToggle
                    checked={convertOptions.autoUpdate}
                    title="自动更新"
                    description="部分机场需在后台允许后才能定时拉取"
                    onChange={(autoUpdate) =>
                      setConvertOptions((current) => ({
                        ...current,
                        autoUpdate,
                      }))
                    }
                  />
                  <OptionToggle
                    checked={convertOptions.filterUnsupported}
                    title="过滤不支持节点"
                    recommended
                    description="避免目标客户端收到无效条目"
                    onChange={(filterUnsupported) =>
                      setConvertOptions((current) => ({
                        ...current,
                        filterUnsupported,
                      }))
                    }
                  />
                  <OptionToggle
                    checked={convertOptions.appendType}
                    title="显示协议类型"
                    description="在节点名称前追加类型"
                    onChange={(appendType) =>
                      setConvertOptions((current) => ({ ...current, appendType }))
                    }
                  />
                  <OptionToggle
                    checked={convertOptions.skipCertVerify}
                    title="跳过证书验证"
                    description="仅在确有需要时开启"
                    caution
                    onChange={(skipCertVerify) =>
                      setConvertOptions((current) => ({
                        ...current,
                        skipCertVerify,
                      }))
                    }
                  />
                  {target === "singbox" ? (
                    <OptionToggle
                      checked={convertOptions.singboxIpv6}
                      title="sing-box IPv6"
                      description="控制 FakeIP、TUN 地址与 AAAA 解析"
                      onChange={(singboxIpv6) =>
                        setConvertOptions((current) => ({
                          ...current,
                          singboxIpv6,
                        }))
                      }
                    />
                  ) : null}
                </div>

                <div className="advanced-fields">
                  <label className="compact-field">
                    <span><strong>包含节点</strong><small>正则</small></span>
                    <input
                      value={convertOptions.include}
                      onChange={(event) =>
                        setConvertOptions((current) => ({
                          ...current,
                          include: event.target.value,
                        }))
                      }
                      maxLength={500}
                      placeholder="例如：香港|日本|新加坡"
                    />
                  </label>
                  <label className="compact-field">
                    <span><strong>排除节点</strong><small>正则</small></span>
                    <input
                      value={convertOptions.exclude}
                      onChange={(event) =>
                        setConvertOptions((current) => ({
                          ...current,
                          exclude: event.target.value,
                        }))
                      }
                      maxLength={500}
                      placeholder="例如：过期|官网|剩余流量"
                    />
                  </label>
                  <label className="compact-field is-wide">
                    <span><strong>节点重命名</strong><small>匹配@替换，多条用 ` 分隔</small></span>
                    <input
                      value={convertOptions.rename}
                      onChange={(event) =>
                        setConvertOptions((current) => ({
                          ...current,
                          rename: event.target.value,
                        }))
                      }
                      maxLength={1000}
                      placeholder="例如：香港@HK`新加坡@SG"
                    />
                  </label>
                  <label className="compact-field">
                    {/* An override, not a step: the agent is picked from the
                        output format on its own. Say so, or someone reads an
                        empty field as something they forgot to fill in. */}
                    <span><strong>自定义 User-Agent</strong><small>一般不用填</small></span>
                    <input
                      value={convertOptions.customUserAgent}
                      onChange={(event) =>
                        setConvertOptions((current) => ({
                          ...current,
                          customUserAgent: event.target.value,
                        }))
                      }
                      maxLength={256}
                      placeholder="留空即可，按输出格式自动选择"
                    />
                  </label>
                  {convertOptions.autoUpdate ? (
                    <label className="compact-field">
                      <span><strong>更新间隔</strong><small>1–168 小时</small></span>
                      <input
                        type="number"
                        min={1}
                        max={168}
                        value={convertOptions.updateIntervalHours}
                        onChange={(event) =>
                          setConvertOptions((current) => ({
                            ...current,
                            updateIntervalHours: Number(event.target.value),
                          }))
                        }
                      />
                    </label>
                  ) : (
                    <div className="manual-update-note">
                      <strong>当前不自动更新</strong>
                      <span>固定地址仍然有效；需要新节点时，由用户在客户端手动刷新。</span>
                    </div>
                  )}
                </div>

                <p className="advanced-footnote">
                  转换引擎先识别输入协议，再按所选客户端语法输出；目标客户端不认识的协议无法通过改格式强行获得支持。
                </p>
              </div>
            </details>

            {storesProfiles || remoteConfigOptions.length === 0 ? null : (
              <div className="remote-config-field">
                <label className="field" htmlFor="remote-config">
                  <span className="field-label">
                    <strong>远程配置</strong>
                    <small>决定分组与规则，默认用本项目的 Ekko Rules</small>
                  </span>
                  <Picker
                    id="remote-config"
                    label="远程配置"
                    value={remoteConfigId}
                    onChange={setRemoteConfigId}
                    options={[
                      ...remoteConfigOptions.map((option) => ({
                        value: option.id,
                        label: option.label,
                        hint: option.description,
                        section: option.builtin ? "本项目" : "第三方规则",
                      })),
                      ...(allowCustomRemoteConfig
                        ? [
                            {
                              value: "__custom__",
                              label: "自定义地址",
                              hint: "填入任意 https 配置地址",
                              section: "第三方规则",
                            },
                          ]
                        : []),
                    ]}
                  />
                </label>
                {usingCustomRemoteConfig ? (
                  <input
                    type="url"
                    value={customRemoteConfig}
                    onChange={(event) => setCustomRemoteConfig(event.target.value)}
                    placeholder="https://example.com/your-config.ini"
                    spellCheck={false}
                    maxLength={512}
                  />
                ) : null}
                {usingThirdPartyRemoteConfig ? (
                  <small className="remote-config-note">
                    选择非 Ekko Rules 时，这次转换的分组、规则与基础配置全部来自对方项目。
                  </small>
                ) : null}
              </div>
            )}

            {storesProfiles ? (
              <button
                type="submit"
                className="primary-button"
                disabled={busy || !sourceReady || !engineOk}
              >
                <span>
                  {busy
                    ? "正在验证并创建"
                    : createdProfile
                      ? "按当前设置重新生成"
                      : "创建本地订阅地址"}
                </span>
                <span aria-hidden="true">{busy ? "…" : "→"}</span>
              </button>
            ) : (
              /* The link is already live at the top of the page, so there is
                 nothing to submit — but the actions belong here too, where the
                 last option was just changed. */
              <div className="open-tail" data-ready={sourceReady ? "true" : "false"}>
                <p className="open-tail-note">
                  {sourceReady
                    ? "改任何一项，上面的链接都会立刻跟着变。"
                    : "填入订阅地址，链接就会当场拼出来。"}
                </p>
                <div className="open-tail-actions">
                  {renderCurrentInstallActions()}
                  <button
                    type="button"
                    className={`open-action ${
                      sourceReady && supportsClientInstallQr(target) ? "" : "is-primary"
                    }`}
                    disabled={!sourceReady}
                    onClick={() => void copyUrl(recordCurrentLink())}
                  >
                    {copying === "stateless" ? "已复制" : "复制链接"}
                  </button>
                  <button
                    type="button"
                    className="open-action"
                    disabled={!sourceReady}
                    onClick={() => openQr(recordCurrentLink())}
                  >
                    扫码导入
                  </button>
                  <StarInvite stars={health?.repo_stars} />
                </div>
                {renderShadowrocketImportNotice()}
                {/* The generated file carries its own DNS section. Clients ship
                    a DNS override that silently replaces it, and a visitor who
                    turns it on loses the mainland/overseas split the rules
                    depend on. Say so where the import happens. */}
                <p className="open-client-note">
                  <b>客户端里会改写配置的开关，不懂就别动。</b>
                  「DNS 覆写」「Smart 内核 / 智能分组」「全局扩展脚本」这些都会改掉你刚
                  导入的这份配置——DNS、策略组、分流规则这边都配好了，保持关闭即可。
                  确实清楚自己在调什么再接管。
                </p>
              </div>
            )}

            {error ? (
              <div className="message is-error" role="alert">
                <strong>没有创建地址</strong><span>{error}</span>
              </div>
            ) : null}
          </form>

          {storesProfiles ? (
          <aside className={`result-card ${createdProfile ? "has-result" : ""}`}>
            <div>
              <p className="result-label">
                {storesProfiles ? "LOCAL SUBSCRIPTION URL" : "YOUR SUBSCRIPTION URL"}
              </p>
              <h2>{createdProfile ? "地址已就绪" : "等待生成"}</h2>
              <p className="result-summary">
                {createdProfile
                  ? "表单内容已保留；可以微调选项后重新生成一个地址。"
                  : storesProfiles
                    ? "创建后，这里会出现可重复刷新的固定地址。"
                    : "生成后，这里会出现可重复刷新的订阅地址。服务器不保存任何内容。"}
              </p>
            </div>

            {createdProfile ? (
              <div className="created-result">
                <div className="url-ticket">
                  <span>{storesProfiles ? "固定本地地址" : "你的订阅地址"}</span>
                  <code>{absoluteLocalUrl(createdProfile.subscriptionPath, subscriptionBaseUrl)}</code>
                </div>
                <button className="copy-button" type="button" onClick={() => void copyUrl(createdProfile)}>
                  {copying === createdProfile.id ? "已复制" : "复制地址"}
                </button>
                <button className="qr-button" type="button" onClick={() => openQr(createdProfile)}>
                  显示二维码
                </button>
                {createdShadowrocketAddresses ? (
                  <div className="shadowrocket-created-actions">
                    <a className="open-action is-primary" href={createdShadowrocketHomeInstallValue}>
                      ① 导入节点订阅
                    </a>
                    <a className="open-action" href={createdShadowrocketConfigInstallValue}>
                      ② 导入分流配置
                    </a>
                  </div>
                ) : null}
                <a className="download-link" href={createdProfile.downloadPath}>下载当前配置</a>
                {createdShadowrocketAddresses ? (
                  <p className="shadowrocket-import-notice" role="note">
                    <strong>两个都要导入：</strong>
                    第 1 步保留名称、流量横幅和全部节点；第 2 步补上规则与 DIRECT / REJECT，各策略组既可使用 PROXY，也可单独选择首页节点。
                  </p>
                ) : null}
                {storesProfiles ? null : (
                  <p className="stateless-warning">
                    这个链接里包含你的真实订阅地址。它不会保存在服务器上，但也因此<strong>不要分享给别人</strong>。
                  </p>
                )}
              </div>
            ) : (
              <div className="empty-ticket" aria-hidden="true">
                <span>
                  {storesProfiles
                    ? subscriptionBaseUrl
                      ? `${subscriptionBaseUrl}/sub/`
                      : "http://本机地址/sub/"
                    : subscriptionBaseUrl
                      ? `${subscriptionBaseUrl}/sub?url=…`
                      : "https://本站地址/sub?url=…"}
                </span><i />
              </div>
            )}

            <dl className="result-specs">
              <div><dt>规则</dt><dd>Ekko Rules {health?.rules_version ?? "—"}</dd></div>
              <div><dt>协议</dt><dd>自动识别 · 无需手选</dd></div>
              <div>
                <dt>{storesProfiles ? "重启后" : "服务器保存"}</dt>
                <dd>{storesProfiles ? "地址仍然有效" : "不保存任何内容"}</dd>
              </div>
              <div><dt>离线时</dt><dd>已有客户端配置照常使用</dd></div>
            </dl>
          </aside>
          ) : null}
        </div>

        {storesProfiles ? (
        <section className="profiles-section">
            {/* Where the personal deployment actually imports from: the saved
                list, on every visit, not just the session that created a
                profile. */}
            <p className="open-client-note">
              <b>客户端里会改写配置的开关，不懂就别动。</b>
              「DNS 覆写」「Smart 内核 / 智能分组」「全局扩展脚本」这些都会改掉你刚
              导入的这份配置——DNS、策略组、分流规则这边都配好了，保持关闭即可。
              确实清楚自己在调什么再接管。
            </p>
          <div className="profiles-heading">
            <div>
              <p className="section-label">SAVED LOCALLY</p>
              <h2>本地订阅地址</h2>
            </div>
            <span>{profileCountLabel}</span>
          </div>

          <details className={`address-manager ${health?.subscription_base_url_error ? "is-error" : ""}`}>
            <summary>
              <span className="address-manager-mark">URL</span>
              <span className="address-manager-current">
                <strong>订阅地址前缀</strong>
                <code>{subscriptionBaseUrl || "正在读取本机地址"}</code>
              </span>
              <span className="address-manager-action">管理地址</span>
            </summary>
            <div className="address-manager-body">
              <div className="address-manager-note">
                <strong>
                  {health?.subscription_base_url_error
                    ? "预设前缀已忽略"
                    : health?.lan_access_enabled
                      ? "本机与局域网均可使用"
                      : "当前只允许本机使用"}
                </strong>
                <span>
                  {health?.subscription_base_url_error
                    ? "LAN_BASE_URL 只用于页面生成地址，不会阻止后台转换；请在这里重新选择前缀。"
                    : health?.detected_lan_ipv4
                      ? baseUrlMode === "detected"
                        ? `已跟随当前电脑 IP：${health.detected_lan_ipv4}`
                        : `已识别当前电脑 IP：${health.detected_lan_ipv4}`
                      : "前缀只用于显示、复制和二维码；任何能访问本服务的地址都可配合同一档案 ID 使用。"}
                </span>
              </div>
              <div className="lan-prefix-actions" aria-label="订阅地址模式">
                <button
                  type="button"
                  className={
                    baseUrlMode === "localhost" &&
                    subscriptionBaseUrl === localhostBaseUrl
                      ? "is-active"
                      : ""
                  }
                  onClick={useLocalhostAddress}
                >
                  本机 localhost
                </button>
                <button
                  type="button"
                  className={
                    baseUrlMode === "current" &&
                    subscriptionBaseUrl === runtimeOrigin
                      ? "is-active"
                      : ""
                  }
                  onClick={useCurrentAccessAddress}
                >
                  当前访问地址
                </button>
                <button
                  type="button"
                  className={`is-primary ${
                    baseUrlMode === "detected" &&
                    subscriptionBaseUrl === health?.detected_lan_base_url
                      ? "is-active"
                      : ""
                  }`}
                  onClick={() => void refreshLanAddress()}
                  disabled={lanRefreshing}
                >
                  {lanRefreshing
                    ? "正在识别…"
                    : health?.detected_lan_ipv4
                      ? `使用局域网 ${health.detected_lan_ipv4}`
                      : "自动识别局域网 IP"}
                </button>
              </div>
              <div className={`lan-prefix-control ${baseUrlMode === "custom" ? "is-active" : ""}`}>
                <label htmlFor="subscription-base-url">自定义前缀</label>
                <input
                  id="subscription-base-url"
                  type="url"
                  value={baseUrlDraft}
                  onChange={(event) => {
                    setBaseUrlDraft(event.target.value);
                    setBaseUrlError(null);
                  }}
                  placeholder="http://192.168.1.100:8787"
                  spellCheck={false}
                />
                <button type="button" onClick={() => applyBaseUrlPrefix(baseUrlDraft, "custom")}>应用</button>
              </div>
              {baseUrlHistory.length ? (
                <div className="lan-prefix-history">
                  <span>曾用地址</span>
                  <div>
                    {baseUrlHistory.map((value) => (
                      <button
                        type="button"
                        className={
                          baseUrlMode === "history" && value === subscriptionBaseUrl
                            ? "is-active"
                            : ""
                        }
                        onClick={() => {
                          setBaseUrlDraft(value);
                          applyBaseUrlPrefix(value, "history");
                        }}
                        key={value}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {baseUrlError ? <small className="lan-prefix-error">{baseUrlError}</small> : null}
            </div>
          </details>

          {profileError ? <div className="message is-error" role="alert">{profileError}</div> : null}

          {!profilesLoaded ? (
            <div className="profiles-empty">
              <strong>{health?.access_password_required ? "输入访问密码后读取" : "正在读取本地地址"}</strong>
              <span>真实订阅不会显示在这个列表里。</span>
            </div>
          ) : profiles.length === 0 ? (
            <div className="profiles-empty">
              <strong>还没有固定地址</strong>
              <span>上面创建的第一个订阅会出现在这里。</span>
            </div>
          ) : (
            <div className="profile-list">
              {profiles.map((profile) => {
                const capability = targets.find((item) => item.id === profile.target);
                return (
                  <article className="profile-item" key={profile.id}>
                    <div className="profile-main">
                      <span className="profile-format">{capability?.short_label ?? profile.target}</span>
                      <div>
                        <strong>{profile.name}</strong>
                        <code>{absoluteLocalUrl(profile.subscriptionPath, subscriptionBaseUrl)}</code>
                      </div>
                    </div>
                    <div className="profile-meta">
                      <span>{profile.enabledOptionCount} 项选项 · {formatDate(profile.createdAt)}</span>
                      <button type="button" onClick={() => void copyUrl(profile)}>
                        {copying === profile.id ? "已复制" : "复制"}
                      </button>
                      <button type="button" onClick={() => openQr(profile)}>二维码</button>
                      <a href={profile.downloadPath}>下载</a>
                      <button className="delete-button" type="button" onClick={() => void deleteProfile(profile)}>删除</button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
        ) : null}

        {storesProfiles ? null : (
          <section className="privacy-panel">
            <div className="privacy-heading">
              <p className="section-label">PRIVACY</p>
              <h2>这个站不保存你的订阅</h2>
            </div>
            <ul className="privacy-list">
              <li>
                <strong>没有账号，也没有档案列表</strong>
                <span>
                  服务器不保存订阅、节点或任何属于某个人的记录，也就没有可以被别人列出来的内容。你的链接只在你手上。
                </span>
              </li>
              <li>
                <strong>订阅正文不落盘</strong>
                <span>
                  转换时才去拉取你的订阅，内容只写进容器的内存文件系统，转换结束立即删除；节点、生成的配置和转换历史都不保留。
                </span>
              </li>
              <li>
                <strong>日志里没有你的订阅地址</strong>
                <span>
                  服务端日志只记录事件类型、目标格式和字节数；反向代理按本项目的配置只记录路径，不记录带着订阅地址的查询串。
                </span>
              </li>
              <li>
                <strong>唯一被记下来的是四个数字</strong>
                <span>
                  页面上的访问与转换计数是四个累加的整数，按日归零一次。它们不含
                  地址、IP、Cookie 或任何能指向某个人的东西；关掉它只需要一个环境变量。
                </span>
              </li>
              <li>
                <strong>链接在你的浏览器里拼成</strong>
                <span>
                  点“生成订阅链接”不会向服务器提交任何东西，服务器并不知道你生成过什么。
                </span>
              </li>
              <li className="is-caution">
                <strong>但链接本身带着你的订阅凭据</strong>
                <span>
                  这是无状态转换的代价：任何拿到该链接的人都能取回你的节点。请只导入自己的客户端，不要转发、不要贴到公开场合。
                </span>
              </li>
            </ul>
            <p className="privacy-footnote">
              不想让任何第三方经手，可以用同一套代码在自己的电脑或服务器上跑一份：
              {siteLinks.length ? (
                <a href={siteLinks[0].url} target="_blank" rel="noreferrer noopener">
                  {siteLinks[0].label}
                </a>
              ) : (
                "本项目开源"
              )}
              。本地部署的形态会把真实订阅留在本机，连链接里都不会出现。
            </p>
          </section>
        )}

        {qrProfile ? (
          <div className="qr-dialog" role="dialog" aria-modal="true" aria-label="本地订阅二维码">
            <button className="qr-backdrop" type="button" aria-label="关闭二维码" onClick={() => setQrProfile(null)} />
            <div className="qr-card">
              <div>
                <strong>{qrProfile.name}</strong>
                <span>
                  {qrProfile.target === "shadowrocket"
                    ? "Shadowrocket 需要连续完成下面两步。"
                    : qrScanHint(qrProfile.target)}
                </span>
              </div>
              {qrProfile.target === "shadowrocket" ? (
                <>
                  <div className="shadowrocket-qr-steps" aria-label="Shadowrocket 导入步骤">
                    <button
                      type="button"
                      aria-pressed={shadowrocketQrStep === "home"}
                      onClick={() => {
                        setQrCopied(false);
                        setShadowrocketQrStep("home");
                      }}
                    >
                      ① 首页节点订阅
                    </button>
                    <button
                      type="button"
                      aria-pressed={shadowrocketQrStep === "config"}
                      onClick={() => {
                        setQrCopied(false);
                        setShadowrocketQrStep("config");
                      }}
                    >
                      ② 配置页分流规则
                    </button>
                  </div>
                  <div className="qr-instruction" role="alert">
                    <strong>
                      {shadowrocketQrStep === "home"
                        ? "第 1 步：从 Shadowrocket 首页扫码"
                        : "第 2 步：从 Shadowrocket「配置」页扫码"}
                    </strong>
                    <span>
                      {shadowrocketQrStep === "home"
                        ? "这一步建立可刷新的节点订阅，保留名称、流量横幅和全部节点。导入后再切到第 2 步。"
                        : "这一步导入规则、策略组与 DIRECT / REJECT；默认 PROXY 使用首页当前节点，也可在每个组里单独选择首页节点。"}
                    </span>
                  </div>
                </>
              ) : null}
              <QRCodeSVG
                value={qrValue}
                size={220}
                level="M"
                marginSize={4}
                title={`${qrProfile.name} 本地订阅二维码`}
              />
              <div className="qr-value">
                <span>
                  {qrProfile.target === "shadowrocket"
                    ? shadowrocketQrStep === "home"
                      ? "Shadowrocket 节点订阅地址（.yaml）"
                      : "Shadowrocket 原生分流配置地址（.conf）"
                    : "远程订阅地址"}
                </span>
                <code>{selectedScanAddress}</code>
                <button
                  type="button"
                  className="qr-copy"
                  onClick={() => {
                    void copyText(selectedScanAddress);
                    setQrCopied(true);
                    window.setTimeout(() => setQrCopied(false), 1600);
                  }}
                >
                  {qrCopied ? "已复制" : "复制地址"}
                </button>
              </div>
              {qrProfile.target === "shadowrocket" ? (
                <a className="open-action is-primary qr-install" href={selectedShadowrocketInstallValue}>
                  {shadowrocketQrStep === "home"
                    ? "① 一键导入节点订阅"
                    : "② 一键导入分流配置"}
                </a>
              ) : null}
              <small className="qr-note">
                {qrProfile.target === "shadowrocket"
                  ? shadowrocketQrStep === "home"
                    ? "当前只完成节点、名称和流量横幅；请继续第 2 步导入分流配置。"
                    : "完成后请使用配置模式。PROXY 跟随首页当前节点，各策略组也会列出首页全部节点供单独选择；DIRECT / REJECT 由规则决定。"
                  : qrPasteHint(qrProfile.target)}
                {qrProfile.target === "shadowrocket"
                  ? " 两条地址都带着你的订阅凭据，不要分享。"
                  : " 客户端会把它存成可刷新的远程地址，之后规则更新不用重新扫。它和页面上那条链接一样，带着你的订阅凭据。"}
              </small>
              <button type="button" className="secondary-button" onClick={() => setQrProfile(null)}>关闭</button>
            </div>
          </div>
        ) : null}
      </section>

      <footer className="footer-row">
        <div className="footer-facts">
          {storesProfiles ? (
            <>
              <span>真实订阅仅存本机数据卷</span><span aria-hidden="true">/</span>
              <span>生成结果不留存</span><span aria-hidden="true">/</span>
              <span>docker compose down -v 可彻底删除</span>
            </>
          ) : (
            <>
              <span>服务器不保存订阅、节点与转换记录</span><span aria-hidden="true">/</span>
              <span>每个链接只属于生成它的人</span><span aria-hidden="true">/</span>
              <span>可自行部署同一套服务</span>
            </>
          )}
        </div>
      </footer>
    </main>
  );
}
