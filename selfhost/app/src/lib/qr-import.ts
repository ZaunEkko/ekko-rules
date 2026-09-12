export type QrImportMode = "install" | "raw";

/**
 * Clients that register a URL scheme can take a subscription in one tap, with
 * no QR code and no clipboard.
 *
 * Only a scheme that has been confirmed against the real client belongs here:
 * a button that silently does nothing is worse than no button. sing-box is
 * deliberately absent — its import scheme has not been verified here.
 */
const INSTALL_SCHEMES: Record<string, (url: string) => string> = {
  clash: (url) =>
    `clash://install-config?${new URLSearchParams({ url }).toString()}`,
};

export function supportsClientInstallQr(target: string): boolean {
  return target in INSTALL_SCHEMES;
}

export function clientInstallLabel(target: string): string {
  return target === "clash" ? "一键导入 Clash / Mihomo" : "";
}

export function qrImportValue(
  target: string,
  subscriptionUrl: string,
  mode: QrImportMode,
): string {
  const build = INSTALL_SCHEMES[target];
  if (mode !== "install" || !build) {
    return subscriptionUrl;
  }
  return build(subscriptionUrl);
}
