import { isIP } from "node:net";
import { isMap, isNode, isScalar, parseDocument, stringify } from "yaml";

type HostValue = string | string[];
type YamlDocument = ReturnType<typeof parseDocument>;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function document(content: string): YamlDocument {
  const parsed = parseDocument(content, { merge: true, logLevel: "silent" });
  // Parser errors can contain subscription credentials; expose no source text.
  if (parsed.errors.length || !isMap(parsed.contents)) {
    throw new Error("Cannot preserve subscription hosts: invalid YAML mapping.");
  }
  return parsed;
}

function field(parsed: YamlDocument, key: string): unknown {
  try {
    const node = parsed.get(key, true);
    return isNode(node) ? node.toJS(parsed, { maxAliasCount: 100 }) : node;
  } catch {
    throw new Error("Cannot preserve subscription hosts: invalid YAML mapping.");
  }
}

function hosts(parsed: YamlDocument): Record<string, HostValue> {
  const entries = Object.entries(record(field(parsed, "hosts")));
  return Object.fromEntries(entries.filter((entry): entry is [string, HostValue] => {
    const value = entry[1];
    return typeof value === "string" ||
      (Array.isArray(value) && value.length > 0 && value.every(item => typeof item === "string"));
  }));
}

/** Edit only these root fields: reserializing nodes can corrupt numeric credentials. */
function replaceFields(
  body: string,
  parsed: YamlDocument,
  values: Record<string, unknown>,
): string {
  if (!isMap(parsed.contents)) return body;
  const edits = [];
  let appended = "";
  for (const [key, value] of Object.entries(values)) {
    const pair = parsed.contents.items.find(pair => isScalar(pair.key) && pair.key.value === key);
    const text = stringify({ [key]: value }, { lineWidth: 0 });
    if (pair && isNode(pair.key) && pair.key.range && isNode(pair.value) && pair.value.range) {
      edits.push({ start: pair.key.range[0], end: pair.value.range[2], text });
    } else {
      appended += text;
    }
  }
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    body = body.slice(0, edit.start) + edit.text + body.slice(edit.end);
  }
  return appended ? body.replace(/\s*$/, "\n") + appended : body;
}

function localNameserver(dns: Record<string, unknown>): string {
  const listen = typeof dns.listen === "string" ? dns.listen : "127.0.0.1:53";
  try {
    const url = new URL(`udp://${listen}`);
    if (!url.port || url.pathname || url.search || url.hash || url.username || url.password) {
      throw new Error("invalid listener");
    }
    if (url.hostname === "0.0.0.0") url.hostname = "127.0.0.1";
    if (url.hostname === "[::]") url.hostname = "[::1]";
    dns.listen = listen;
    return url.toString();
  } catch {
    throw new Error("Cannot preserve subscription hosts: invalid DNS listener.");
  }
}

function whitelistRules(pattern: string): string[] {
  for (const [prefix, type] of [["geosite:", "GEOSITE"], ["rule-set:", "RULE-SET"]]) {
    if (pattern.startsWith(prefix)) {
      return pattern.slice(prefix.length).split(",").map(name => `${type},${name},fake-ip`);
    }
  }
  if (pattern.startsWith("+.")) return [`DOMAIN-SUFFIX,${pattern.slice(2)},fake-ip`];
  if (pattern.startsWith(".")) pattern = `*${pattern}`;
  return [`${pattern.includes("*") ? "DOMAIN-WILDCARD" : "DOMAIN"},${pattern},fake-ip`];
}

function resolverList(value: unknown): string[] {
  return (Array.isArray(value) ? value : [value])
    .filter((item): item is string => typeof item === "string" && item.length > 0);
}

function routedResolver(server: string): boolean {
  const fragment = server.indexOf("#");
  return fragment >= 0 && server.slice(fragment + 1).split("&")
    .some(part => part.length > 0 && !part.includes("=") && part !== "DIRECT");
}

function independentResolver(server: string, localResolver: string): boolean {
  if (routedResolver(server) || server === "system") return false;
  try {
    const endpoint = new URL(server.includes("://") ? server : `udp://${server}`);
    const local = new URL(localResolver);
    const defaults: Record<string, string> = {"http:": "80", "https:": "443", "tls:": "853", "quic:": "853"};
    const loopbacks = ["127.0.0.1", "localhost", "[::1]", "0.0.0.0", "[::]"];
    const sameHost = endpoint.hostname === local.hostname ||
      (loopbacks.includes(endpoint.hostname) && loopbacks.includes(local.hostname));
    return !sameHost || (endpoint.port || defaults[endpoint.protocol] || "53") !== local.port;
  } catch {
    return false;
  }
}

/** Keep alias endpoints resolvable before a rule-routed DoH connection exists. */
function protectAliasBootstrap(
  dns: Record<string, unknown>,
  domains: string[],
  localResolver: string,
): void {
  const policy = record(dns["nameserver-policy"]);
  const upstreams = [dns.nameserver, dns.fallback, ...Object.values(policy)]
    .flatMap(resolverList);
  if (dns["respect-rules"] !== true && !upstreams.some(routedResolver)) return;

  const existing = new Map(Object.entries(policy)
    .filter(([key]) => !key.startsWith("geosite:") && !key.startsWith("rule-set:"))
    .flatMap(([key, servers]) => key.split(",").map(domain => [domain, resolverList(servers)] as const)));
  const pending = domains.filter(domain => {
    const servers = existing.get(domain);
    return !servers?.length || !servers.every(server => independentResolver(server, localResolver));
  });
  if (!pending.length) return;

  const bootstrap = [dns["direct-nameserver"], dns.nameserver, dns["default-nameserver"]]
    .map(resolverList)
    .find(servers => servers.length > 0 && servers.every(server =>
      independentResolver(server, localResolver),
    ));
  if (!bootstrap) {
    throw new Error("Cannot preserve subscription hosts: independent DNS bootstrap is required.");
  }

  const result = { ...policy };
  // Mihomo supports comma-separated exact domains. Bound key length to keep
  // generated YAML in simple-key form instead of emitting explicit long keys.
  let key = "";
  for (const domain of [...new Set(pending)].sort()) {
    if (key && key.length + domain.length + 1 > 900) {
      result[key] = bootstrap;
      key = "";
    }
    key = key ? `${key},${domain}` : domain;
  }
  if (key) result[key] = bootstrap;
  dns["nameserver-policy"] = result;
}

/**
 * The engine retains nodes but discards source-level hosts. Domain aliases also
 * need the DNS listener: Mihomo's outbound resolver only reads IP-valued hosts,
 * while its DNS server follows CNAME-valued hosts. Scope that detour to the
 * aliased domains, keeping every other node's resolver and the template's rules.
 */
export function preserveMihomoHosts(body: string, sources: readonly string[]): string {
  const sourceHosts = Object.create(null) as Record<string, HostValue>;
  // The main subscription takes precedence over its providers.
  for (const source of [...sources].reverse()) {
    // URI/base64 subscriptions and ordinary configs need no extra parsing.
    if (!/^\uFEFF?(?:hosts|"hosts"|'hosts')\s*:/m.test(source)) continue;
    Object.assign(sourceHosts, hosts(document(source)));
  }
  if (!Object.keys(sourceHosts).length) return body;

  const parsed = document(body);
  const merged = { ...hosts(parsed), ...sourceHosts };
  const aliases = Object.entries(merged).filter(([, value]) =>
    typeof value === "string" && value.length > 0 && !isIP(value),
  ) as [string, string][];
  const values: Record<string, unknown> = { hosts: merged };
  if (aliases.length) {
    const dns = { ...record(field(parsed, "dns")) };
    const nameserver = localNameserver(dns);
    dns.enable = true;
    dns["use-hosts"] = true;
    if (!Array.isArray(dns.nameserver) || !dns.nameserver.length) dns.nameserver = ["system"];
    if (!Array.isArray(dns["proxy-server-nameserver"]) || !dns["proxy-server-nameserver"].length) {
      dns["proxy-server-nameserver"] = ["system"];
    }
    const existingPolicy = record(dns["proxy-server-nameserver-policy"]);
    const nodes = field(parsed, "proxies");
    const aliasDomains = new Set(aliases.map(([domain]) => domain.toLowerCase()));
    // A homogeneous subscription needs only one resolver entry. Mixed inputs
    // retain per-domain policies so unrelated nodes keep their own DNS path.
    const servers = Array.isArray(nodes) ? nodes.map(node => record(node).server) : [];
    const allAliased = servers.length > 0 && servers.every(server =>
      typeof server === "string" && (isIP(server) || aliasDomains.has(server.toLowerCase())),
    ) && servers.some(server => typeof server === "string" && aliasDomains.has(server.toLowerCase()));
    if (allAliased && !Object.keys(existingPolicy).length) {
      dns["proxy-server-nameserver"] = [nameserver];
      delete dns["proxy-server-nameserver-policy"];
    } else {
      dns["proxy-server-nameserver-policy"] = {
        ...existingPolicy,
        ...Object.fromEntries(aliases.map(([domain]) => [domain, [nameserver]])),
      };
    }

    const domains = [...new Set(aliases.map(([, domain]) => domain))];
    protectAliasBootstrap(dns, domains, nameserver);

    // Hosts redirects are applied before fake-IP filtering, so filter the
    // destination domains, not just the original node names.
    if (dns["enhanced-mode"] === "fake-ip") {
      const filters = Array.isArray(dns["fake-ip-filter"])
        ? dns["fake-ip-filter"].filter((item): item is string => typeof item === "string")
        : [];
      if (dns["fake-ip-filter-mode"] === "whitelist" || dns["fake-ip-filter-mode"] === "rule") {
        const rules = dns["fake-ip-filter-mode"] === "whitelist"
          ? [...filters.flatMap(whitelistRules), "MATCH,real-ip"]
          : filters;
        dns["fake-ip-filter-mode"] = "rule";
        dns["fake-ip-filter"] = [...domains.map(domain => `DOMAIN,${domain},real-ip`), ...rules];
      } else {
        dns["fake-ip-filter"] = [...new Set([...filters, ...domains])];
      }
    }
    values.dns = dns;
  }
  return replaceFields(body, parsed, values);
}
