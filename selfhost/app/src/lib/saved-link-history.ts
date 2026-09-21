export type SavedLinkComparable = {
  name: string;
  link: string;
  target: string;
  restore?: {
    url: string;
    remoteConfigId: string;
    customRemoteConfig?: string;
    convertOptions: Record<string, unknown>;
  };
};

function stableOptions(options: Record<string, unknown>): Array<[string, unknown]> {
  return Object.entries(options).sort(([left], [right]) =>
    left.localeCompare(right),
  );
}

/** A semantic identity: address serialization changes are not a new config. */
export function savedLinkIdentity(entry: SavedLinkComparable): string {
  if (!entry.restore) {
    return JSON.stringify([
      entry.target,
      entry.name.trim(),
      entry.link.trim(),
    ]);
  }
  return JSON.stringify([
    entry.target,
    entry.name.trim(),
    entry.restore.url.trim(),
    entry.restore.remoteConfigId,
    entry.restore.customRemoteConfig?.trim() ?? "",
    stableOptions(entry.restore.convertOptions),
  ]);
}

/** Keeps the newest occurrence (input order) and removes older duplicates. */
export function dedupeSavedLinks<T extends SavedLinkComparable>(entries: T[]): T[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const identity = savedLinkIdentity(entry);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}
