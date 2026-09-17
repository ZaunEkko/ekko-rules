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
  // `proxy-providers: # downloaded hourly` is a valid header, and missing it
  // would send the untouched document to the engine — the exact failure this
  // module exists to prevent.
  const start = lines.findIndex((line) =>
    /^proxy-providers:\s*(?:#.*)?$/.test(line),
  );
  if (start < 0) return null;
  return { lines, start, end: topLevelSectionEnd(lines, start) };
}

const URL_VALUE = /url:\s*("(?:\\.|[^"\\])*"|'(?:''|[^'])*'|[^,}]+)/;

/**
 * Drops nested flow mappings so a `health-check: {url: …}` written on one line
 * cannot be read as the provider's own download URL.
 */
function withoutNestedFlowMappings(line: string, keepDepth: number): string {
  let depth = 0;
  let kept = "";
  for (const character of line) {
    if (character === "{") {
      depth += 1;
      if (depth <= keepDepth) kept += character;
      continue;
    }
    if (character === "}") {
      if (depth <= keepDepth) kept += character;
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth <= keepDepth) kept += character;
  }
  return kept;
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

/**
 * Every provider's own download URL, in document order, without duplicates.
 *
 * Only a `url:` sitting at a provider's own key depth counts. The nested
 * `health-check.url` that most real provider blocks carry is a probe endpoint,
 * not a node source; fetching it would waste a slot and return nothing usable.
 * A `file:` provider is ignored too: it names a path on whatever machine wrote
 * the config, which is not this one.
 */
export function findProxyProviderUrls(content: string): string[] {
  const section = proxyProviderSection(content);
  if (!section) return [];

  const body = section.lines.slice(section.start + 1, section.end);
  const urls: string[] = [];
  let entryIndent: number | null = null;
  let keyIndent: number | null = null;

  for (const raw of body) {
    if (!raw.trim()) continue;
    const indent = indentOf(raw);

    if (entryIndent === null) {
      // The first content line under the section is a provider name.
      entryIndent = indent;
    }
    if (indent === entryIndent) {
      // A provider header. It may carry the whole definition inline.
      // On a header the outermost braces are the provider's own mapping, so
      // one level of them stays; a mapping inside that is health-check.
      const inline = withoutNestedFlowMappings(raw, 1);
      const match = inline.match(URL_VALUE);
      if (match) {
        const value = parseYamlScalar(match[1]);
        if (/^https?:\/\//i.test(value) && !urls.includes(value)) {
          urls.push(value);
          if (urls.length >= MAX_PROXY_PROVIDERS) break;
        }
      }
      keyIndent = null;
      continue;
    }
    if (indent <= entryIndent) continue;

    // The first line deeper than a header sets the depth of that provider's
    // own keys; anything deeper belongs to a nested mapping.
    if (keyIndent === null) keyIndent = indent;
    if (indent !== keyIndent) continue;

    // On one of the provider's own keys any braces are already a nested
    // mapping, so none of them stay.
    const match = withoutNestedFlowMappings(raw, 0).match(URL_VALUE);
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
