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
 *
 * The second repair is about values, not fields. A credential that happens to
 * look like a number — `short-id: 00112233`, `password: 0123` — is read as one
 * somewhere in the conversion and comes back as a different string:
 *
 *   00112233 -> 38043      (read as octal)
 *   0123     -> 83         (read as octal)
 *   1e5      -> 100000     (read as a float)
 *   00       -> 0
 *   "00112233" -> 00112233 (quoted, survives)
 *
 * A mangled `short-id` at least fails loudly: Mihomo refuses the whole profile
 * with "invalid REALITY short ID". A mangled password is worse — the profile
 * loads and the node simply never connects. Quoting these values on the way in
 * leaves nothing to reinterpret.
 */

/** Hysteria2 keys this engine version rejects the whole list over. */
const HYSTERIA2_UNSUPPORTED = ["ports", "up", "down"];

/** Credentials. Every one of these is a string, whatever it looks like. */
const MUST_STAY_STRING = ["password", "short-id", "auth", "auth-str"];

/**
 * Values YAML would read as a number: plain integers (including the leading
 * zeros that make them octal), floats, and exponents. A value with any other
 * character in it is already unambiguous and is left alone.
 */
const READS_AS_NUMBER =
  /^[+-]?(?:[0-9][0-9_]*(?:\.[0-9_]*)?(?:[eE][+-]?[0-9]+)?|0[xXbBoO][0-9a-fA-F_]+)$/;

function quotedIfAmbiguous(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (/^["']/.test(trimmed)) return value;
  if (!READS_AS_NUMBER.test(trimmed)) return value;
  return `"${trimmed}"`;
}

// The value may be quoted: some serialisers quote every string they emit.
const HYSTERIA2_TYPE = /(?:^|[,{\s])type:\s*["']?(?:hysteria2|hy2)\b/i;

function splitFlowFields(inner: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let escaped = false;
  let current = "";
  for (const character of inner) {
    if (quote) {
      current += character;
      // A double-quoted scalar may escape its own quote; the field does not
      // end there, and splitting on it would cut a credential in half.
      if (escaped) {
        escaped = false;
        continue;
      }
      if (quote === '"' && character === "\\") {
        escaped = true;
        continue;
      }
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

function rewriteFlowFields(
  line: string,
  { drop = [] as string[], quote = false } = {},
): string {
  const open = line.indexOf("{");
  const close = line.lastIndexOf("}");
  if (open < 0 || close <= open) return line;
  const kept: string[] = [];
  let changed = false;
  for (const part of splitFlowFields(line.slice(open + 1, close))) {
    const separator = part.indexOf(":");
    const key = (separator < 0 ? part : part.slice(0, separator)).trim();
    if (drop.includes(key)) {
      changed = true;
      continue;
    }
    if (separator < 0) {
      kept.push(part);
      continue;
    }
    const value = part.slice(separator + 1).trim();
    if (value.startsWith("{")) {
      // `reality-opts: {short-id: …}` — the credential lives one level in.
      const nested = rewriteFlowFields(value, { quote });
      if (nested !== value) changed = true;
      kept.push(`${key}: ${nested}`);
      continue;
    }
    if (quote && MUST_STAY_STRING.includes(key)) {
      const repaired = quotedIfAmbiguous(value);
      if (repaired !== value) changed = true;
      kept.push(`${key}: ${repaired}`);
      continue;
    }
    kept.push(part);
  }
  // Rejoining normalises whitespace, so a line with nothing to change is
  // returned untouched rather than reformatted.
  if (!changed) return line;
  return `${line.slice(0, open + 1)}${kept.join(", ")}${line.slice(close)}`;
}

/**
 * Groups the lines of a `proxies:` block into one array per entry, so a field
 * is only removed from the node that declared it.
 */
function proxyEntries(lines: string[]): { start: number; end: number }[] {
  // A node's own fields may include a nested sequence — `alpn:` followed by
  // `- h3` is ordinary in a Hysteria2 entry. Only the shallowest `- ` in the
  // block starts a node; anything deeper belongs to the node above it, and
  // treating it as a new entry would cut that node in half and leave the
  // fields below it unfiltered.
  const itemIndents = lines
    .filter((line) => /^\s*-\s/.test(line))
    .map((line) => line.length - line.trimStart().length);
  if (!itemIndents.length) return [];
  const entryIndent = Math.min(...itemIndents);

  const entries: { start: number; end: number }[] = [];
  for (const [index, line] of lines.entries()) {
    if (!/^\s*-\s/.test(line)) continue;
    if (line.length - line.trimStart().length !== entryIndent) continue;
    if (entries.length) entries.at(-1)!.end = index;
    entries.push({ start: index, end: lines.length });
  }
  return entries;
}

/**
 * The same subscription with the unreadable Hysteria2 extras removed. Anything
 * else — other node types, other fields, the surrounding config — is returned
 * untouched.
 */
export function repairNodesForEngine(content: string): string {
  return repair(content, { dropUnsupported: true });
}

/**
 * The same quoting, applied to what the engine hands back.
 *
 * Getting a value safely *into* the engine is only half of it: the engine
 * writes the config out unquoted again, and then the client's own YAML parser
 * reads `short-id: 826209375e63` as a float. Mihomo refuses the whole profile
 * with "invalid REALITY short ID" — measured on a real subscription whose
 * upstream copy was perfectly fine and whose converted copy was not.
 *
 * Nothing is dropped here: the node set that came back is the node set that
 * goes out.
 */
export function quoteCredentialsForClient(content: string): string {
  return repair(content, { dropUnsupported: false });
}

function repair(
  content: string,
  { dropUnsupported }: { dropUnsupported: boolean },
): string {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((line) => /^proxies:\s*$/.test(line));
  if (start < 0) {
    // A bare list of entries with no `proxies:` header still reaches here from
    // a provider body, so treat the whole document as the block.
    return applyToBlock(lines, 0, lines.length, dropUnsupported).join("\n");
  }
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^[A-Za-z][A-Za-z0-9-]*:/.test(lines[index])) {
      end = index;
      break;
    }
  }
  return applyToBlock(lines, start + 1, end, dropUnsupported).join("\n");
}

function applyToBlock(
  lines: string[],
  from: number,
  to: number,
  dropUnsupported: boolean,
): string[] {
  const block = lines.slice(from, to);
  const rewritten = new Map<number, string>();
  const dropped = new Set<number>();

  for (const entry of proxyEntries(block)) {
    const entryLines = block.slice(entry.start, entry.end);
    // Quoting applies to every node; dropping fields only to Hysteria2, and
    // only on the way in — what comes back must keep every node it has.
    const isHysteria2 =
      dropUnsupported && HYSTERIA2_TYPE.test(entryLines.join(" "));

    for (let index = entry.start; index < entry.end; index += 1) {
      const line = block[index];
      const absolute = from + index;
      if (line.includes("{")) {
        rewritten.set(
          absolute,
          rewriteFlowFields(line, {
            drop: isHysteria2 ? HYSTERIA2_UNSUPPORTED : [],
            quote: true,
          }),
        );
        continue;
      }
      const key = line.match(/^\s+([a-z0-9-]+):/i)?.[1];
      if (key && MUST_STAY_STRING.includes(key)) {
        const separator = line.indexOf(":");
        const rest = line.slice(separator + 1);
        // A trailing comment is not part of the value. Testing it along with
        // the scalar would hide the very thing this looks for.
        const comment = rest.match(/(\s+#.*)$/)?.[1] ?? "";
        const value = rest.slice(0, rest.length - comment.length).trim();
        // An empty value means the key opens a nested block; leave it be.
        const repaired = value ? quotedIfAmbiguous(value) : "";
        if (value && repaired !== value) {
          rewritten.set(
            absolute,
            `${line.slice(0, separator + 1)} ${repaired}${comment}`,
          );
        }
        continue;
      }
      // Block style: the field owns its own line, unless it is the line that
      // opens the entry — removing that would take the whole node with it.
      if (!isHysteria2 || !key || !HYSTERIA2_UNSUPPORTED.includes(key)) continue;
      dropped.add(absolute);
      // The field may itself open a nested block; take what belongs to it.
      const keyIndent = line.length - line.trimStart().length;
      for (let next = index + 1; next < entry.end; next += 1) {
        const following = block[next];
        if (!following.trim()) continue;
        if (following.length - following.trimStart().length <= keyIndent) break;
        dropped.add(from + next);
      }
    }
  }

  return lines
    .map((line, index) => rewritten.get(index) ?? line)
    .filter((_, index) => !dropped.has(index));
}
