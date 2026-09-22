function sectionEnd(lines: string[], start: number): number {
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^[A-Za-z][A-Za-z0-9-]*:\s*/.test(lines[index])) return index;
  }
  return lines.length;
}

function scalar(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (typeof parsed === "string") return parsed;
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  return trimmed;
}

function proxyNames(section: string[]): string[] {
  return section.flatMap((line) => {
    const flow = line.match(
      /^  - \{\s*name:\s*("(?:\\.|[^"\\])*"|'(?:''|[^'])*'|[^,}]+)/,
    );
    const block = line.match(/^  - name:\s*(.+)$/);
    const value = flow?.[1] ?? block?.[1];
    return value === undefined ? [] : [scalar(value)];
  });
}

function externalizeGroup(
  block: string[],
  nodeNames: Set<string>,
  providerName: string,
): string[] {
  const rewritten: string[] = [];
  let removedNode = false;
  let providerAlreadyUsed = false;

  for (let index = 0; index < block.length; index += 1) {
    const property = block[index].match(/^(\s+)(proxies|use):\s*$/);
    if (!property) {
      if (/^\s+include-all:\s*true\s*$/i.test(block[index])) {
        removedNode = true;
        continue;
      }
      rewritten.push(block[index]);
      continue;
    }

    const propertyLine = block[index];
    const propertyIndent = property[1].length;
    const keptEntries: string[] = [];
    while (index + 1 < block.length) {
      const next = block[index + 1];
      if (!next.trim()) {
        index += 1;
        continue;
      }
      const indent = next.match(/^\s*/)?.[0].length ?? 0;
      if (indent <= propertyIndent) break;
      index += 1;
      const entry = next.match(/^\s+-\s+(.+)$/)?.[1];
      if (property[2] === "proxies" && entry && nodeNames.has(scalar(entry))) {
        removedNode = true;
        continue;
      }
      if (property[2] === "use" && entry && scalar(entry) === providerName) {
        providerAlreadyUsed = true;
      }
      keptEntries.push(next);
    }
    if (keptEntries.length) rewritten.push(propertyLine, ...keptEntries);
  }

  if (removedNode && !providerAlreadyUsed) {
    const useIndex = rewritten.findIndex((line) => /^\s+use:\s*$/.test(line));
    if (useIndex < 0) {
      rewritten.push("    use:", `      - ${JSON.stringify(providerName)}`);
    } else {
      const propertyIndent = rewritten[useIndex].match(/^\s*/)?.[0].length ?? 0;
      let insertAt = useIndex + 1;
      while (insertAt < rewritten.length) {
        const indent = rewritten[insertAt].match(/^\s*/)?.[0].length ?? 0;
        if (rewritten[insertAt].trim() && indent <= propertyIndent) break;
        insertAt += 1;
      }
      rewritten.splice(insertAt, 0, `      - ${JSON.stringify(providerName)}`);
    }
  }
  return rewritten;
}

/**
 * Keep the complete Clash document and add a named provider for Shadowrocket.
 *
 * The two in-app scanners consume the same URL differently: the home scanner
 * refreshes the URL itself as a node subscription and therefore needs inline
 * `proxies`, while the configuration scanner can retain the provider title and
 * Subscription-Userinfo banner. Policy groups use the provider copy so the
 * imported configuration still has one authoritative remote node source.
 */
export function externalizeShadowrocketProvider(
  completeConfig: string,
  input: { name: string; url: string; intervalHours: number },
): string {
  const lines = completeConfig.replace(/\r\n/g, "\n").split("\n");
  const proxiesStart = lines.findIndex((line) => /^proxies:\s*$/.test(line));
  if (proxiesStart < 0 || lines.some((line) => /^proxy-providers:\s*$/.test(line))) {
    throw new Error("Complete Mihomo config cannot be externalized safely.");
  }
  const proxiesEnd = sectionEnd(lines, proxiesStart);
  const names = proxyNames(lines.slice(proxiesStart, proxiesEnd));
  if (!names.length) throw new Error("Complete Mihomo config contains no named proxies.");

  const providerName = input.name.trim() || "Shadowrocket";
  const interval = Math.max(3600, Math.min(604800, Math.round(input.intervalHours * 3600)));
  lines.splice(
    proxiesEnd,
    0,
    "",
    "proxy-providers:",
    `  ${JSON.stringify(providerName)}:`,
    "    type: http",
    `    url: ${JSON.stringify(input.url)}`,
    "    path: ./providers/ekko-shadowrocket.yaml",
    `    interval: ${interval}`,
    "    health-check:",
    "      enable: false",
  );

  const groupsStart = lines.findIndex((line) => /^proxy-groups:\s*$/.test(line));
  if (groupsStart < 0) throw new Error("Complete Mihomo config contains no proxy groups.");
  const groupsEnd = sectionEnd(lines, groupsStart);
  const groupLines = lines.slice(groupsStart + 1, groupsEnd);
  const groups: string[] = [];
  for (let index = 0; index < groupLines.length; ) {
    if (!/^  - name:\s*/.test(groupLines[index])) {
      groups.push(groupLines[index]);
      index += 1;
      continue;
    }
    let end = index + 1;
    while (end < groupLines.length && !/^  - name:\s*/.test(groupLines[end])) end += 1;
    groups.push(...externalizeGroup(groupLines.slice(index, end), new Set(names), providerName));
    index = end;
  }
  lines.splice(groupsStart + 1, groupsEnd - groupsStart - 1, ...groups);
  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}

export function shadowrocketProviderAddress(
  requestUrl: string,
  publicBaseUrl: string,
): string {
  const current = new URL(requestUrl);
  current.searchParams.delete("srhome");
  current.searchParams.set("srnodes", "1");
  current.pathname = current.pathname.replace(/\.yaml$/i, ".nodes.yaml");
  const base = publicBaseUrl.trim();
  return base
    ? new URL(`${current.pathname}${current.search}`, base).toString()
    : current.toString();
}

/** Origin another device can actually reach, never the container bind URL. */
export function visibleSubscriptionOrigin(
  request: Request,
  configuredOrigin: string,
  trustProxyHeaders: boolean,
): string {
  if (configuredOrigin.trim()) return configuredOrigin.trim();
  const forwardedHost = trustProxyHeaders
    ? request.headers.get("x-forwarded-host")?.split(",", 1)[0].trim()
    : "";
  const host = forwardedHost || request.headers.get("host")?.trim() || "";
  const forwardedProtocol = trustProxyHeaders
    ? request.headers.get("x-forwarded-proto")?.split(",", 1)[0].trim()
    : "";
  const protocol = forwardedProtocol || new URL(request.url).protocol.replace(/:$/, "");
  if (host && /^(?:http|https)$/i.test(protocol) && !/[\s\\/?#@]/.test(host)) {
    return `${protocol.toLowerCase()}://${host}`;
  }
  return new URL(request.url).origin;
}
