export type QrImportMode = "install" | "raw";

type InstallScheme = {
  /** Wraps the subscription URL in the client's own import scheme. */
  build: (url: string) => string;
  /** Button text. Names the client, because that is what the tap opens. */
  label: string;
  /** What the QR dialog says about which app to pick after scanning. */
  qrHint: string;
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
    qrHint: "用系统相机或客户端的扫码入口都可以，扫到后选择 Clash / Mihomo 打开。",
  },
  // Shadowrocket keeps nodes and configuration apart: `shadowrocket://add/`
  // adds a node subscription and carries no rules, while `config/add` installs
  // a configuration file — which is the whole file this site generates. The
  // documented form takes the address as the path, unencoded, so the query
  // string stays where the client can still read it.
  shadowrocket: {
    build: (url) => `shadowrocket://config/add/${url}`,
    label: "一键导入 Shadowrocket",
    qrHint: "用系统相机扫，弹出的提示选择用 Shadowrocket 打开，会按「配置文件」装进去。",
  },
};

export function supportsClientInstallQr(target: string): boolean {
  return target in INSTALL_SCHEMES;
}

export function clientInstallLabel(target: string): string {
  return INSTALL_SCHEMES[target]?.label ?? "";
}

export function clientInstallQrHint(target: string): string {
  return (
    INSTALL_SCHEMES[target]?.qrHint ?? "请在客户端的“从 QR 码导入”入口扫描。"
  );
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
