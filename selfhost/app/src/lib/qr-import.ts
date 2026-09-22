export type QrImportMode = "install" | "raw";

type InstallScheme = {
  /** Wraps the subscription URL in the client's own import scheme. */
  build: (url: string, name: string) => string;
  /** Button text. Names the client, because that is what the tap opens. */
  label: string;
  /**
   * One line under the QR code, naming where it works.
   *
   * There is only ever one code: it carries an ordinary address, and that
   * address answers a client with the configuration and a browser with a page
   * that opens the client. The hint exists for the one case the address
   * cannot fix by itself — a client whose scan entry files an address under
   * the wrong kind of thing.
   */
  qrHint: string;
};

/**
 * Clients that register a URL scheme can take a subscription in one tap, with
 * no QR code and no clipboard. Someone reading the page on the phone they are
 * about to configure should never have to copy anything.
 *
 * Only a documented scheme belongs here: a button that silently does nothing
 * is worse than no button.
 */
const INSTALL_SCHEMES: Record<string, InstallScheme> = {
  /*
   * Each entry is a scheme its own vendor documents:
   *
   *   Clash / Mihomo  clash://install-config?url=            (client convention)
   *   Shadowrocket    shadowrocket://config/add/<address>    (使用手册 · URL-Schemes)
   *   sing-box        sing-box://import-remote-profile?url=…#name
   *                                                         (sing-box.sagernet.org/clients/general)
   *   Surge           surge:///install-config?url=           (manual.nssurge.com/tools/url-scheme)
   *   Loon            loon://import?sub=                     (Loon URL Schemes)
   *   Surfboard       surfboard:///install-config?url=       (getsurfboard.com/docs/deeplink)
   *
   * Quantumult X is deliberately absent: its `update-configuration` scheme
   * takes remote resources, not a complete configuration, and a full profile
   * is imported by hand. Quantumult and Mellow document no scheme at all.
   * They keep the copy path, which works everywhere.
   */
  clash: {
    build: (url) =>
      `clash://install-config?${new URLSearchParams({ url }).toString()}`,
    label: "一键导入 Clash / Mihomo",
    qrHint: "手机相机、客户端自带的扫码入口，扫哪个都行。",
  },
  // Shadowrocket keeps nodes and configuration apart: `shadowrocket://add/`
  // adds a node subscription and carries no rules, while `config/add` installs
  // a configuration file — which is the whole file this site generates. The
  // documented form takes the address as the path, unencoded, so the query
  // string stays where the client can still read it.
  shadowrocket: {
    build: (url) => `shadowrocket://config/add/${url}`,
    label: "一键导入 Shadowrocket",
    qrHint:
      "首页或「配置」页扫码使用同一条 HTTPS 配置地址；节点只来自其中的同名远程订阅，因此只添加一份节点订阅。",
  },
  singbox: {
    build: (url, name) =>
      `sing-box://import-remote-profile?${new URLSearchParams({ url }).toString()}` +
      (name ? `#${encodeURIComponent(name)}` : ""),
    label: "一键导入 sing-box",
    qrHint: "手机相机、客户端自带的扫码入口，扫哪个都行。",
  },
  surge: {
    build: (url) =>
      `surge:///install-config?${new URLSearchParams({ url }).toString()}`,
    label: "一键导入 Surge",
    qrHint: "手机相机、客户端自带的扫码入口，扫哪个都行。",
  },
  loon: {
    build: (url) => `loon://import?${new URLSearchParams({ sub: url }).toString()}`,
    label: "一键导入 Loon",
    qrHint: "手机相机、客户端自带的扫码入口，扫哪个都行。",
  },
  surfboard: {
    build: (url) =>
      `surfboard:///install-config?${new URLSearchParams({ url }).toString()}`,
    label: "一键导入 Surfboard",
    qrHint: "手机相机、客户端自带的扫码入口，扫哪个都行。",
  },
};

export function supportsClientInstallQr(target: string): boolean {
  return target in INSTALL_SCHEMES;
}

export function clientInstallLabel(target: string): string {
  return INSTALL_SCHEMES[target]?.label ?? "";
}

/**
 * What to do with the address instead of scanning it.
 *
 * For most clients the answer is the same either way — scan it or paste it
 * into their URL import, same configuration. Shadowrocket is the exception
 * worth spelling out: pasting into the wrong one of its two entries takes the
 * nodes and leaves the rules behind.
 */
export function qrPasteHint(target: string): string {
  if (target === "shadowrocket") {
    return "二维码使用下方 HTTPS 完整配置地址；一键导入按钮才使用 config/add。";
  }
  return "扫码、或把这条地址粘进客户端的「从 URL 导入」，结果是同一份配置。";
}

export function qrScanHint(target: string): string {
  return (
    INSTALL_SCHEMES[target]?.qrHint ??
    "手机相机、客户端自带的扫码入口，扫哪个都行。"
  );
}

export function qrImportValue(
  target: string,
  subscriptionUrl: string,
  mode: QrImportMode,
  name = "",
): string {
  const scheme = INSTALL_SCHEMES[target];
  if (mode !== "install" || !scheme) {
    return subscriptionUrl;
  }
  return scheme.build(subscriptionUrl, name.trim());
}

/**
 * The actual payload rendered into the single QR code.
 *
 * Shadowrocket's home scanner visibly accepts the HTTPS address but ignores a
 * config/add QR payload. Keep the QR as HTTPS and let the provider-only config
 * prevent the scanned outer document from duplicating its node list. The
 * separate one-tap button can still use the documented config/add action.
 */
export function qrCodeValue(
  target: string,
  subscriptionUrl: string,
  name = "",
): string {
  return subscriptionUrl;
}
