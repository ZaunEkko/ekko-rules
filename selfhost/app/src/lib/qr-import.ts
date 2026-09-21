export type QrImportMode = "install" | "raw";

type InstallScheme = {
  /** Wraps the subscription URL in the client's own import scheme. */
  build: (url: string) => string;
  /** Button text. Names the client, because that is what the tap opens. */
  label: string;
  /**
   * Which of the two codes a person should be shown first.
   *
   * The two scanners want opposite things. A client's own scan entry writes
   * whatever it reads into its address field, so it takes an `https://` URL
   * and refuses the client's own scheme — ClashMetaForAndroid answers
   * "Unsupported url clash://install-config?…", and Shadowrocket's silently
   * does nothing. The phone's camera is the reverse: it hands a scheme to the
   * system, which opens the client, while an `https://` URL only opens a
   * browser.
   *
   * So the default follows whichever entry actually installs this file for
   * this client. Mihomo clients read a Clash document from their own scan
   * entry, so they get the plain address. Shadowrocket's scan entry only
   * takes node subscriptions and would drop every rule, so its configuration
   * has to arrive through the system, as a scheme.
   */
  defaultQrMode: QrImportMode;
  /** What the dialog says for each code, naming the entry that reads it. */
  qrHints: Record<QrImportMode, string>;
};

/**
 * Clients that register a URL scheme can take a subscription in one tap, with
 * no QR code and no clipboard.
 *
 * Only a scheme that has been confirmed against the real client belongs here:
 * a button that silently does nothing is worse than no button. sing-box is
 * deliberately absent — its import scheme has not been verified here.
 */
const INSTALL_SCHEMES: Record<string, InstallScheme> = {
  clash: {
    build: (url) =>
      `clash://install-config?${new URLSearchParams({ url }).toString()}`,
    label: "一键导入 Clash / Mihomo",
    defaultQrMode: "raw",
    qrHints: {
      raw: "在客户端里扫：Clash Verge Rev、Mihomo Party、ClashMetaForAndroid 的「新建配置 / 扫码」入口，扫完就是一份完整配置。",
      install:
        "用手机系统相机扫，弹出的提示里选择 Clash / Mihomo 打开。客户端自带的扫码入口不认这种 scheme，会报 Unsupported url。",
    },
  },
  // Shadowrocket keeps nodes and configuration apart: `shadowrocket://add/`
  // adds a node subscription and carries no rules, while `config/add` installs
  // a configuration file — which is the whole file this site generates. The
  // documented form takes the address as the path, unencoded, so the query
  // string stays where the client can still read it.
  shadowrocket: {
    build: (url) => `shadowrocket://config/add/${url}`,
    label: "一键导入 Shadowrocket",
    defaultQrMode: "install",
    qrHints: {
      install:
        "用手机系统相机扫，弹出的提示里选择 Shadowrocket 打开，会按「配置文件」装进去。",
      raw: "这是纯地址。Shadowrocket 自带的扫码入口只会把它当成节点订阅，规则不会跟过去；要带规则就复制它，到「配置」页右上角 ➕ 粘贴。",
    },
  },
};

export function supportsClientInstallQr(target: string): boolean {
  return target in INSTALL_SCHEMES;
}

export function clientInstallLabel(target: string): string {
  return INSTALL_SCHEMES[target]?.label ?? "";
}

/** Which of the two codes to show first for this client. */
export function defaultQrImportMode(target: string): QrImportMode {
  return INSTALL_SCHEMES[target]?.defaultQrMode ?? "raw";
}

export function clientInstallQrHint(
  target: string,
  mode: QrImportMode = defaultQrImportMode(target),
): string {
  return (
    INSTALL_SCHEMES[target]?.qrHints[mode] ??
    "请在客户端的「从 QR 码导入」入口扫描这个地址。"
  );
}

/** Short label for the switch between the two codes. */
export function qrModeLabel(mode: QrImportMode): string {
  return mode === "install" ? "系统相机扫" : "客户端里扫";
}

export function qrImportValue(
  target: string,
  subscriptionUrl: string,
  mode: QrImportMode,
): string {
  const scheme = INSTALL_SCHEMES[target];
  if (mode !== "install" || !scheme) {
    return subscriptionUrl;
  }
  return scheme.build(subscriptionUrl);
}
