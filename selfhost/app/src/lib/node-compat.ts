/**
 * The conversion engine is pinned at a version that predates a few Hysteria2
 * extras, and it does not skip what it cannot read — it refuses the entire
 * node list. One node carrying `ports` (port hopping) together with the `up`
 * and `down` bandwidth hints turned a 47-node subscription into zero nodes,
 * which reached the visitor as a 502.
 *
 * Those three fields are optimisations, not connection parameters: without
 * them the node still connects on its own `port`. So they are removed on the
 * way in, and the subscription converts whole.
 *
 * Measured against the engine, one real subscription, 47 nodes of which 3 were
 * Hysteria2:
 *
 *   as sent by the provider          list=400, 0 nodes
 *   with these three fields removed  list=200, 47 nodes
 */

/** Hysteria2 keys this engine version rejects the whole list over. */
const HYSTERIA2_UNSUPPORTED = ["ports", "up", "down"];

const HYSTERIA2_TYPE = /(?:^|[,{\s])type:\s*(?:hysteria2|hy2)\b/i;

function splitFlowFields(inner: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = "";
  for (const character of inner) {
    if (quote) {
      current += character;
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      current += character;
      continue;
    }
    if (character === "{" || character === "[") depth += 1;
    if (character === "}" || character === "]") depth -= 1;
    if (character === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function stripFlowFields(line: string, keys: string[]): string {
  const open = line.indexOf("{");
  const close = line.lastIndexOf("}");
  if (open < 0 || close <= open) return line;
  const kept = splitFlowFields(line.slice(open + 1, close)).filter(
    (part) => !keys.includes(part.split(":")[0].trim()),
  );
  return `${line.slice(0, open + 1)}${kept.join(", ")}${line.slice(close)}`;
}

/**
 * Groups the lines of a `proxies:` block into one array per entry, so a field
 * is only removed from the node that declared it.
 */
function proxyEntries(lines: string[]): { start: number; end: number }[] {
  const entries: { start: number; end: number }[] = [];
  for (const [index, line] of lines.entries()) {
    if (/^\s*-\s/.test(line)) {
      if (entries.length) entries.at(-1)!.end = index;
      entries.push({ start: index, end: lines.length });
    }
  }
  return entries;
}

/**
 * The same subscription with the unreadable Hysteria2 extras removed. Anything
 * else — other node types, other fields, the surrounding config — is returned
 * untouched.
 */
export function dropUnsupportedNodeFields(content: string): string {
  if (!HYSTERIA2_TYPE.test(content)) return content;

  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((line) => /^proxies:\s*$/.test(line));
  if (start < 0) {
    // A bare list of entries with no `proxies:` header still reaches here from
    // a provider body, so treat the whole document as the block.
    return applyToBlock(lines, 0, lines.length).join("\n");
  }
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^[A-Za-z][A-Za-z0-9-]*:/.test(lines[index])) {
      end = index;
      break;
    }
  }
  return applyToBlock(lines, start + 1, end).join("\n");
}

function applyToBlock(lines: string[], from: number, to: number): string[] {
  const block = lines.slice(from, to);
  const rewritten = new Map<number, string>();
  const dropped = new Set<number>();

  for (const entry of proxyEntries(block)) {
    const entryLines = block.slice(entry.start, entry.end);
    if (!HYSTERIA2_TYPE.test(entryLines.join(" "))) continue;

    for (let index = entry.start; index < entry.end; index += 1) {
      const line = block[index];
      const absolute = from + index;
      if (line.includes("{")) {
        rewritten.set(absolute, stripFlowFields(line, HYSTERIA2_UNSUPPORTED));
        continue;
      }
      // Block style: the field owns its own line, unless it is the line that
      // opens the entry — removing that would take the whole node with it.
      const key = line.match(/^\s+([a-z0-9-]+):/i)?.[1];
      if (key && HYSTERIA2_UNSUPPORTED.includes(key)) dropped.add(absolute);
    }
  }

  return lines
    .map((line, index) => rewritten.get(index) ?? line)
    .filter((_, index) => !dropped.has(index));
}
