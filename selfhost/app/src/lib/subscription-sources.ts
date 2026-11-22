export const MAX_SUBSCRIPTION_SOURCES = 5;

export type SubscriptionSourceInput =
  | { subscriptionUrl: string; subscriptionUrls?: never }
  | { subscriptionUrls: readonly string[]; subscriptionUrl?: never };

export function uniqueSubscriptionUrls(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function parseSubscriptionSources(
  urls: unknown,
  legacyUrl: unknown = undefined,
): string[] {
  const inputs = urls === undefined ? [legacyUrl] : urls;
  if (
    !Array.isArray(inputs) || inputs.length === 0 ||
    inputs.some((url) => typeof url !== "string" || !url.trim())
  ) {
    throw new Error("subscriptionUrl is required for every source.");
  }
  const sources = uniqueSubscriptionUrls(inputs);
  if (sources.length > MAX_SUBSCRIPTION_SOURCES) {
    throw new Error(`subscriptionUrls must contain at most ${MAX_SUBSCRIPTION_SOURCES} sources.`);
  }
  return sources;
}
