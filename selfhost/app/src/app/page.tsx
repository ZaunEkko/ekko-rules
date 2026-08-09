"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  countEnabledOptions,
  DEFAULT_CONVERT_OPTIONS,
  type ConvertOptions,
} from "@/lib/options";

type Health = {
  status: string;
  ekko_rules_version: string;
  subconverter_version: string;
  subconverter_reachable: boolean;
  access_password_required: boolean;
  lan_access_enabled: boolean;
  subscription_base_url: string | null;
  detected_lan_ipv4: string | null;
  detected_lan_base_url: string | null;
  detected_lan_updated_at: string | null;
  configuration_error: string | null;
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

type Capabilities = {
  supported_targets: TargetCapability[];
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

const FALLBACK_TARGETS: TargetCapability[] = [
  {
    id: "clash",
    label: "Mihomo / Clash",
    short_label: "Mihomo",
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
        <strong>{props.title}</strong>
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

export default function HomePage() {
  const [subscriptionUrl, setSubscriptionUrl] = useState("");
  const [profileName, setProfileName] = useState("");
  const [target, setTarget] = useState("clash");
  const [convertOptions, setConvertOptions] = useState<ConvertOptions>({
    ...DEFAULT_CONVERT_OPTIONS,
  });
  const [showUrl, setShowUrl] = useState(false);
  const [accessPassword, setAccessPassword] = useState("");
  const [health, setHealth] = useState<Health | null>(null);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profilesLoaded, setProfilesLoaded] = useState(false);
  const [createdProfile, setCreatedProfile] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [copying, setCopying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [runtimeOrigin, setRuntimeOrigin] = useState("");
  const [qrProfile, setQrProfile] = useState<Profile | null>(null);
  const [baseUrlOverride, setBaseUrlOverride] = useState("");
  const [baseUrlDraft, setBaseUrlDraft] = useState("");
  const [baseUrlError, setBaseUrlError] = useState<string | null>(null);
  const [baseUrlHistory, setBaseUrlHistory] = useState<string[]>([]);
  const [baseUrlMode, setBaseUrlMode] = useState<BaseUrlMode>("localhost");
  const [lanRefreshing, setLanRefreshing] = useState(false);

  const targets = capabilities?.supported_targets ?? FALLBACK_TARGETS;
  const selectedTarget =
    targets.find((item) => item.id === target) ?? targets[0];
  const mainstreamTargets = targets.filter((item) => item.tier === "mainstream");
  const compatibilityTargets = targets.filter(
    (item) => item.tier === "compatibility",
  );
  const enabledOptionCount = countEnabledOptions(
    target === "singbox"
      ? convertOptions
      : { ...convertOptions, singboxIpv6: false },
  );
  const engineOk = Boolean(
    health?.subconverter_reachable && !health.configuration_error,
  );
  const sourceReady = Boolean(subscriptionUrl.trim());
  const defaultSubscriptionBaseUrl =
    health?.subscription_base_url || runtimeOrigin;
  const subscriptionBaseUrl =
    baseUrlOverride || defaultSubscriptionBaseUrl;
  const localhostBaseUrl = useMemo(() => {
    if (!runtimeOrigin) return "";
    const current = new URL(runtimeOrigin);
    current.hostname = "localhost";
    return current.origin;
  }, [runtimeOrigin]);

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

  useEffect(() => {
    setRuntimeOrigin(window.location.origin);
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
    const timer = window.setInterval(loadRuntimeStatus, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
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

  useEffect(() => {
    if (health && !health.access_password_required && !profilesLoaded) {
      void loadProfiles();
    }
  }, [health, loadProfiles, profilesLoaded]);

  const profileCountLabel = useMemo(() => {
    if (!profilesLoaded) return "等待读取";
    return `${profiles.length} 个固定地址`;
  }, [profiles.length, profilesLoaded]);

  async function createProfile(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
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
      setQrProfile(payload.profile);
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

  async function copyUrl(profile: Profile) {
    const value = absoluteLocalUrl(profile.subscriptionPath, subscriptionBaseUrl);
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
    <main className="page-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            E<i />
          </span>
          <div className="brand-copy">
            <strong>Ekko Rules Local</strong>
            <span>私有订阅工作台</span>
          </div>
        </div>
        <div className="runtime-status" aria-live="polite">
          <span className={`status-dot ${engineOk ? "is-ok" : ""}`} />
          <strong>
            {health === null
              ? "正在连接本地服务"
              : engineOk
                ? "转换引擎已就绪"
                : "转换引擎未就绪"}
          </strong>
          <code>{subscriptionBaseUrl ? new URL(subscriptionBaseUrl).host : "本机 Docker"}</code>
        </div>

      </header>

      <section className="workbench">
        <div className="intro-row">
          <div className="intro-copy">
            <p className="kicker">LOCAL / PRIVATE / REUSABLE</p>
            <h1>导入一次，以后原地址更新。</h1>
            <p>
              把真实订阅交给本机 Docker，得到一个固定的本地订阅 URL。客户端只需导入一次；以后启动服务，再刷新同一个地址。
            </p>
          </div>
          <div className="privacy-seal">
            <span className="seal-icon" aria-hidden="true"><i /></span>
            <div>
              <strong>不经过第三方转换站</strong>
              <span>源地址只保存在本机 Docker 数据卷</span>
            </div>
          </div>
        </div>

        <div className="route-strip" aria-label="本地订阅工作流程">
          <div className={`route-step ${sourceReady ? "is-ready" : ""}`}>
            <span className="step-number">01</span>
            <div><strong>真实订阅</strong><small>仅本机保存</small></div>
          </div>
          <span className="route-link" aria-hidden="true" />
          <div className={`route-step ${engineOk ? "is-ready" : ""} ${busy ? "is-active" : ""}`}>
            <span className="step-number">02</span>
            <div><strong>完整配置</strong><small>DNS + 策略组 + 规则</small></div>
          </div>
          <span className="route-link" aria-hidden="true" />
          <div className={`route-step ${createdProfile ? "is-ready" : ""}`}>
            <span className="step-number">03</span>
            <div><strong>固定地址</strong><small>客户端导入一次</small></div>
          </div>
        </div>

        <div className="content-grid">
          <form className="profile-form" onSubmit={createProfile}>
            <div className="section-heading">
              <div>
                <p className="section-label">CREATE LOCAL PROFILE</p>
                <h2>创建本地订阅</h2>
              </div>
              <span className="format-badge">{targets.length} 种格式</span>
            </div>

            <label className="field" htmlFor="subscription-url">
              <span className="field-label">
                <strong>真实订阅地址</strong>
                <small>不会出现在生成的本地 URL 中</small>
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
            </div>

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

            <div className="target-note">
              <div>
                <span className="target-icon">{selectedTarget.short_label.slice(0, 1)}</span>
                <div>
                  <strong>{selectedTarget.label}</strong>
                  <span>{selectedTarget.client_family}</span>
                </div>
              </div>
              {selectedTarget.verified_modern_protocols.length >= 4 ? (
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

            <details className="advanced-panel">
              <summary>
                <span>
                  <strong>高级选项</strong>
                  <small>随固定地址保存，每次刷新继续生效</small>
                </span>
                <span className="advanced-count">{enabledOptionCount} 项启用</span>
              </summary>

              <div className="advanced-body">
                <div className="option-grid">
                  <OptionToggle
                    checked={convertOptions.emoji}
                    title="Emoji 国旗"
                    description="按节点地区补充旗帜"
                    onChange={(emoji) =>
                      setConvertOptions((current) => ({ ...current, emoji }))
                    }
                  />
                  <OptionToggle
                    checked={convertOptions.udp}
                    title="启用 UDP"
                    description="为目标支持的节点强制开启"
                    onChange={(udp) =>
                      setConvertOptions((current) => ({ ...current, udp }))
                    }
                  />
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
                    description="按节点名称稳定排序"
                    onChange={(sort) =>
                      setConvertOptions((current) => ({ ...current, sort }))
                    }
                  />
                  <OptionToggle
                    checked={convertOptions.autoUpdate}
                    title="自动更新"
                    description="关闭后只在用户手动刷新时更新"
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
                      description="为 sing-box 完整配置启用 IPv6"
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
                    <span><strong>自定义 User-Agent</strong><small>拉取上游时使用</small></span>
                    <input
                      value={convertOptions.customUserAgent}
                      onChange={(event) =>
                        setConvertOptions((current) => ({
                          ...current,
                          customUserAgent: event.target.value,
                        }))
                      }
                      maxLength={256}
                      placeholder="留空使用 Ekko 默认值"
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

            {error ? (
              <div className="message is-error" role="alert">
                <strong>没有创建地址</strong><span>{error}</span>
              </div>
            ) : null}
          </form>

          <aside className={`result-card ${createdProfile ? "has-result" : ""}`}>
            <div>
              <p className="result-label">LOCAL SUBSCRIPTION URL</p>
              <h2>{createdProfile ? "地址已就绪" : "等待创建"}</h2>
              <p className="result-summary">
                {createdProfile
                  ? "表单内容已保留；可以微调选项后重新生成一个地址。"
                  : "创建后，这里会出现可重复刷新的固定地址。"}
              </p>
            </div>

            {createdProfile ? (
              <div className="created-result">
                <div className="url-ticket">
                  <span>固定本地地址</span>
                  <code>{absoluteLocalUrl(createdProfile.subscriptionPath, subscriptionBaseUrl)}</code>
                </div>
                <button className="copy-button" type="button" onClick={() => void copyUrl(createdProfile)}>
                  {copying === createdProfile.id ? "已复制" : "复制地址"}
                </button>
                <button className="qr-button" type="button" onClick={() => setQrProfile(createdProfile)}>
                  显示二维码
                </button>
                <a className="download-link" href={createdProfile.downloadPath}>下载当前配置</a>
              </div>
            ) : (
              <div className="empty-ticket" aria-hidden="true">
                <span>{subscriptionBaseUrl ? `${subscriptionBaseUrl}/sub/` : "http://本机地址/sub/"}</span><i />
              </div>
            )}

            <dl className="result-specs">
              <div><dt>规则</dt><dd>Ekko Rules {health?.ekko_rules_version ?? "—"}</dd></div>
               <div><dt>引擎</dt><dd>{health?.subconverter_version ?? "—"}</dd></div>
               <div><dt>协议</dt><dd>自动识别 · 无需手选</dd></div>
              <div><dt>重启后</dt><dd>地址仍然有效</dd></div>
              <div><dt>离线时</dt><dd>已有客户端配置照常使用</dd></div>
            </dl>
          </aside>
        </div>

        <section className="profiles-section">
          <div className="profiles-heading">
            <div>
              <p className="section-label">SAVED LOCALLY</p>
              <h2>本地订阅地址</h2>
            </div>
            <span>{profileCountLabel}</span>
          </div>

          <details className={`address-manager ${health?.configuration_error ? "is-error" : ""}`}>
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
                  {health?.configuration_error
                    ? "局域网地址配置有误"
                    : health?.lan_access_enabled
                      ? "本机与局域网均可使用"
                      : "当前只允许本机使用"}
                </strong>
                <span>
                  {health?.configuration_error
                    ? "请检查 .env 中的 LAN_BASE_URL。"
                    : health?.detected_lan_ipv4
                      ? baseUrlMode === "detected"
                        ? `已跟随当前电脑 IP：${health.detected_lan_ipv4}`
                        : `已识别当前电脑 IP：${health.detected_lan_ipv4}`
                      : "切换前缀不会改变任何档案 ID。"}
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
                      <button type="button" onClick={() => setQrProfile(profile)}>二维码</button>
                      <a href={profile.downloadPath}>下载</a>
                      <button className="delete-button" type="button" onClick={() => void deleteProfile(profile)}>删除</button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {qrProfile ? (
          <div className="qr-dialog" role="dialog" aria-modal="true" aria-label="本地订阅二维码">
            <button className="qr-backdrop" type="button" aria-label="关闭二维码" onClick={() => setQrProfile(null)} />
            <div className="qr-card">
              <div>
                <strong>{qrProfile.name}</strong>
                <span>手机扫描后导入；设备必须能访问这台电脑。</span>
              </div>
              <QRCodeSVG
                value={absoluteLocalUrl(qrProfile.subscriptionPath, subscriptionBaseUrl)}
                size={220}
                level="M"
                marginSize={4}
                title={`${qrProfile.name} 本地订阅二维码`}
              />
              <code>{absoluteLocalUrl(qrProfile.subscriptionPath, subscriptionBaseUrl)}</code>
              <button type="button" className="secondary-button" onClick={() => setQrProfile(null)}>关闭</button>
            </div>
          </div>
        ) : null}
      </section>

      <footer className="footer-row">
        <span>真实订阅仅存本机数据卷</span><span aria-hidden="true">/</span>
        <span>生成结果不留存</span><span aria-hidden="true">/</span>
        <span>docker compose down -v 可彻底删除</span>
      </footer>
    </main>
  );
}
