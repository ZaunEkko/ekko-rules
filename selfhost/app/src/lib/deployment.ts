// Deployment policy for the self-hosted converter. There are exactly two
// shapes, because they answer two different questions:
//
// `lan`    "I want my own machine to hold my subscription." Personal computer
//          or trusted LAN, stored fixed addresses, nothing published.
// `public` "I want anyone to be able to convert here." An open converter that
//          stores nothing: every visitor builds their own link, so there is no
//          list for one visitor to read from another.
//
// Anyone who wants their own machine in the loop runs `lan`; there is no third
// shape that stores other people's subscriptions on a public server.

export type DeployMode = "lan" | "public";

export function parseDeployMode(raw: string | undefined): DeployMode {
  const value = (raw || "").trim().toLowerCase();
  if (value === "public" || value === "open" || value === "stateless") {
    return "public";
  }
  return "lan";
}

/** Only the personal deployment keeps real subscriptions on disk. */
export function storesProfiles(mode: DeployMode): boolean {
  return mode === "lan";
}

export function normalizePublicBaseUrl(raw: string | undefined): {
  value: string;
  error: string;
} {
  const value = raw?.trim() || "";
  if (!value) return { value: "", error: "" };
  try {
    const parsed = new URL(value);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.username ||
      parsed.password ||
      (parsed.pathname !== "/" && parsed.pathname !== "") ||
      parsed.search ||
      parsed.hash
    ) {
      throw new Error("invalid base URL");
    }
    return { value: parsed.origin, error: "" };
  } catch {
    return {
      value: "",
      error:
        "PUBLIC_BASE_URL must be an http(s) origin without a path or credentials.",
    };
  }
}

export function isLoopbackBind(host: string | undefined): boolean {
  const value = (host || "").trim().replace(/^\[|\]$/g, "").toLowerCase();
  return value === "127.0.0.1" || value === "::1" || value === "localhost";
}

export function deploymentWarning(input: {
  mode: DeployMode;
  publicBaseUrl: string;
  accessPasswordConfigured: boolean;
  webBindHost?: string;
}): string {
  if (input.mode === "public") {
    return input.publicBaseUrl && !input.publicBaseUrl.startsWith("https://")
      ? "PUBLIC_BASE_URL 不是 HTTPS：访客的订阅内容会以明文传输。"
      : "";
  }
  // One shared profile list, no per-user ownership: anyone who can reach this
  // port can read every /sub/<id>, and each of those returns working nodes.
  if (!input.accessPasswordConfigured && !isLoopbackBind(input.webBindHost)) {
    return "服务对局域网开放且没有设置 ACCESS_PASSWORD：同一网络内的任何设备都能列出并使用你的全部固定订阅地址。";
  }
  return "";
}

/**
 * Additional origins the same open deployment answers on. One server can front
 * several domains; every one of them must be accepted by the host guard, and
 * the page builds links from whichever one the visitor actually used.
 */
export function parseAltOrigins(raw: string | undefined): string[] {
  return (raw || "")
    .split(",")
    .map((item) => normalizePublicBaseUrl(item).value)
    .filter(Boolean);
}

export type DeploymentPolicy = {
  mode: DeployMode;
  publicBaseUrl: string;
  publicBaseUrlError: string;
  altOrigins: string[];
  warning: string;
  storesProfiles: boolean;
  accessPasswordConfigured: boolean;
  /**
   * Non-empty when the deployment refuses management access. Returned to
   * callers as an error so a misconfigured public deployment fails closed.
   */
  error: string;
  trustProxyHeaders: boolean;
};

export function evaluateDeployment(input: {
  mode?: string;
  accessPassword?: string;
  publicBaseUrl?: string;
  trustProxyHeaders?: string;
  webBindHost?: string;
  altOrigins?: string;
}): DeploymentPolicy {
  const mode = parseDeployMode(input.mode);
  const accessPassword = input.accessPassword?.trim() || "";
  const publicBase = normalizePublicBaseUrl(input.publicBaseUrl);

  // The only fatal misconfiguration left is an export origin the page cannot
  // build links from; an open deployment has no password to get wrong.
  const error = mode === "public" && publicBase.error ? publicBase.error : "";

  const trustRaw = (input.trustProxyHeaders || "").trim().toLowerCase();
  const trustProxyHeaders =
    trustRaw === "1" || trustRaw === "true" || trustRaw === "yes"
      ? true
      : trustRaw === "0" || trustRaw === "false" || trustRaw === "no"
        ? false
        : mode === "public";

  return {
    mode,
    storesProfiles: storesProfiles(mode),
    publicBaseUrl: publicBase.value,
    publicBaseUrlError: publicBase.error,
    altOrigins: parseAltOrigins(input.altOrigins),
    warning: deploymentWarning({
      mode,
      publicBaseUrl: publicBase.value,
      accessPasswordConfigured: Boolean(accessPassword),
      webBindHost: input.webBindHost,
    }),
    accessPasswordConfigured: Boolean(accessPassword),
    error,
    trustProxyHeaders,
  };
}
