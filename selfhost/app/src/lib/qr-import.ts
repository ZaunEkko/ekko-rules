export type QrImportMode = "install" | "raw";

export function supportsClientInstallQr(target: string): boolean {
  return target === "clash";
}

export function qrImportValue(
  target: string,
  subscriptionUrl: string,
  mode: QrImportMode,
): string {
  if (mode !== "install" || !supportsClientInstallQr(target)) {
    return subscriptionUrl;
  }

  const query = new URLSearchParams({ url: subscriptionUrl });
  return `clash://install-config?${query.toString()}`;
}
