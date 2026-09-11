import { isIP } from "node:net";

/**
 * Management endpoints are reachable only under a host name that belongs to
 * this deployment. Without this check a page on the public internet can point
 * its own domain at a private address (DNS rebinding), which makes the browser
 * treat the local converter as same-origin and read the whole profile list —
 * every `/sub/<id>` in it is a working credential for those nodes.
 *
 * `/sub/<id>` itself is deliberately not covered: the id is already the
 * credential, and clients legitimately import it under many host names
 * (Tailscale, a router host name, a custom prefix).
 */

function hostnameOf(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";
  const bracketed = trimmed.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketed) return bracketed[1];
  const [host] = trimmed.split(":", 1);
  return host;
}

function originHostname(raw: string | undefined): string {
  if (!raw?.trim()) return "";
  try {
    return new URL(raw.trim()).hostname.replace(/^\[|\]$/g, "").toLowerCase();
  } catch {
    return "";
  }
}

function isPrivateIpv4(value: string): boolean {
  const parts = value.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return false;
  }
  const [a, b] = parts;
  if (a === 127) return true;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  // CGNAT, used by Tailscale and similar personal overlay networks.
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function isPrivateIpv6(value: string): boolean {
  const normalized = value.toLowerCase();
  if (normalized === "::1") return true;
  if (/^f[cd][0-9a-f]{2}:/.test(normalized)) return true; // ULA
  if (/^fe[89ab][0-9a-f]:/.test(normalized)) return true; // link-local
  return false;
}

export type HostGuardInput = {
  hostHeader: string | null;
  deployMode: "lan" | "public";
  publicBaseUrl?: string;
  lanBaseUrl?: string;
  /** Compose service name the engine uses for the internal handoff route. */
  internalOrigin?: string;
  /** Other origins this same deployment answers on. */
  altOrigins?: string[];
};

export function isAllowedManagementHost(input: HostGuardInput): boolean {
  const host = hostnameOf(input.hostHeader || "");
  if (!host) return false;

  const declared = new Set(
    [
      originHostname(input.publicBaseUrl),
      originHostname(input.lanBaseUrl),
      originHostname(input.internalOrigin),
      ...(input.altOrigins || []).map(originHostname),
    ].filter(Boolean),
  );
  if (declared.has(host)) return true;

  if (input.deployMode === "public") {
    // A public deployment knows exactly one name; anything else is a rebind or
    // a stray host header.
    return originHostname(input.publicBaseUrl) ? false : true;
  }

  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host.endsWith(".local")) return true;
  const version = isIP(host);
  if (version === 4) return isPrivateIpv4(host);
  if (version === 6) return isPrivateIpv6(host);
  // Bare Compose/container host names carry no dots and cannot be rebound from
  // a public DNS zone.
  return !host.includes(".");
}

export const HOST_GUARD_MESSAGE =
  "Request host is not part of this deployment.";
