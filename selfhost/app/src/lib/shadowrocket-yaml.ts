const SHADOWROCKET_POLICY_ALIASES = [
  { builtin: "DIRECT", alias: "🚀 DIRECT", type: "direct" },
  { builtin: "REJECT", alias: "🛑 REJECT", type: "reject" },
] as const;

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

function policyAlias(value: string): string | null {
  return SHADOWROCKET_POLICY_ALIASES.find(
    (policy) => policy.builtin === value,
  )?.alias ?? null;
}

function replacePolicyMember(line: string): string {
  const member = line.match(
    /^(\s*-\s+)("(?:\\.|[^"\\])*"|'(?:''|[^'])*'|[^\s#]+)(\s*(?:#.*)?)$/,
  );
  if (!member) return line;
  const alias = policyAlias(scalar(member[2]));
  return alias ? `${member[1]}${JSON.stringify(alias)}${member[3]}` : line;
}

/**
 * Shadowrocket imports a YAML subscription differently from its native .conf
 * format. `DIRECT` and `REJECT` are valid Mihomo built-ins, but some YAML
 * imports do not expose those built-ins as selectable group items. Giving
 * them same-purpose aliases creates ordinary, selectable proxy entries
 * without colliding with Mihomo's reserved names.
 */
export function materializeShadowrocketPolicyChoices(
  completeConfig: string,
): string {
  const lines = completeConfig.replace(/\r\n/g, "\n").split("\n");
  const proxiesStart = lines.findIndex((line) => /^proxies:\s*$/.test(line));
  if (proxiesStart < 0) {
    throw new Error("Complete Mihomo config contains no proxies section.");
  }
  const proxiesEnd = sectionEnd(lines, proxiesStart);
  const existingNames = new Set(proxyNames(lines.slice(proxiesStart, proxiesEnd)));
  const aliases = SHADOWROCKET_POLICY_ALIASES.filter(
    (policy) => !existingNames.has(policy.alias),
  );
  if (aliases.length) {
    lines.splice(
      proxiesEnd,
      0,
      ...aliases.map(
        (policy) => `  - { name: ${JSON.stringify(policy.alias)}, type: ${policy.type} }`,
      ),
    );
  }

  const groupsStart = lines.findIndex((line) => /^proxy-groups:\s*$/.test(line));
  if (groupsStart < 0) {
    throw new Error("Complete Mihomo config contains no proxy groups.");
  }
  const groupsEnd = sectionEnd(lines, groupsStart);
  for (let index = groupsStart + 1; index < groupsEnd; index += 1) {
    lines[index] = replacePolicyMember(lines[index]);
  }

  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}
