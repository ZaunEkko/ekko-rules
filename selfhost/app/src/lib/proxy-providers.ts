/**
 * Some subscriptions do not hand over nodes at all. They return a Clash config
 * whose `proxy-providers:` points at a second URL, and the nodes live there.
 *
 * The conversion engine cannot expand that: given such a document it reports
 * "no valid proxy nodes or proxy providers were found", because the provider
 * is a URL it was never asked to follow. The gateway follows it instead — the
 * same thing it already does for the subscription itself, so the provider goes
 * through the same private-address checks and byte limits.
 *
 * These helpers are text-level on purpose. The rest of this codebase reads
 * Mihomo YAML line by line rather than pulling in a parser, and a provider
 * block is regular enough to read the same way.
 */

/** A provider list longer than this is not a subscription, it is a crawl. */
export const MAX_PROXY_PROVIDERS = 8;

function topLevelSectionEnd(lines: string[], start: number): number {
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^[A-Za-z][A-Za-z0-9-]*:\s*/.test(lines[index])) return index;
  }
  return lines.length;
}

function parseYamlScalar(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (typeof parsed === "string") return parsed;
    } catch {
      // Fall through to the unquoted representation for unusual YAML escapes.
    }
    return trimmed.slice(1, -1);
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  return trimmed;
}

function proxyProviderSection(content: string): {
  lines: string[];
  start: number;
  end: number;
} | null {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((line) => /^proxy-providers:\s*$/.test(line));
  if (start < 0) return null;
  return { lines, start, end: topLevelSectionEnd(lines, start) };
}

/**
 * Every http(s) `url:` inside `proxy-providers:`, in document order, without
 * duplicates. A `file:` provider is ignored: it names a path on whatever
 * machine wrote the config, which is not this one.
 */
export function findProxyProviderUrls(content: string): string[] {
  const section = proxyProviderSection(content);
  if (!section) return [];

  const urls: string[] = [];
  for (const line of section.lines.slice(section.start + 1, section.end)) {
    // Both `url: https://…` and `{type: http, url: https://…}` appear in the
    // wild, so match the key wherever it sits on the line.
    const match = line.match(
      /(?:^\s*|[,{]\s*)url:\s*("(?:\\.|[^"\\])*"|'(?:''|[^'])*'|[^,}]+)/,
    );
    if (!match) continue;
    const value = parseYamlScalar(match[1]);
    if (!/^https?:\/\//i.test(value)) continue;
    if (!urls.includes(value)) urls.push(value);
    if (urls.length >= MAX_PROXY_PROVIDERS) break;
  }
  return urls;
}

/**
 * The same document with `proxy-providers:` removed.
 *
 * It has to go: the engine refuses to produce a node list for any document
 * that still declares a provider it cannot reach, even when inline `proxies:`
 * sit right next to it. What the providers contained is supplied separately,
 * as its own input.
 */
export function stripProxyProviders(content: string): string {
  const section = proxyProviderSection(content);
  if (!section) return content;
  const { lines, start, end } = section;
  lines.splice(start, end - start);
  const remaining = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return remaining ? `${remaining}\n` : "";
}
