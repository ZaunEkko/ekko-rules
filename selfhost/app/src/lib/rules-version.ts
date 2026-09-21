/**
 * Which rules the running engine carries.
 *
 * The rules and the site are released on separate tags, so the version baked
 * into this image cannot speak for the engine: a rules release replaces the
 * engine container without rebuilding this one, and a site release does the
 * reverse. The only honest answer comes from the engine itself, which serves
 * a one-line file stating what it was built from.
 *
 * Failure is not an error state, for the same reason the latest-version check
 * treats it that way: an engine that is starting, or older than this file, has
 * nothing to say about its rules, and the page says nothing rather than
 * showing a number it cannot stand behind.
 */

export type EngineRulesVersion = {
  version: string;
  built: string;
};

const CACHE_TTL_MS = 5 * 60_000;
const FAILURE_BACKOFF_MS = 30_000;
const REQUEST_TIMEOUT_MS = 2_000;
/** A version string is short; anything longer is not one. */
const MAX_BODY_BYTES = 512;

type CacheEntry = {
  value: EngineRulesVersion | null;
  expiresAt: number;
};

let cache: CacheEntry | null = null;
let inFlight: Promise<EngineRulesVersion | null> | null = null;

function sanitize(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  // The engine is ours, but this still crosses a process boundary and lands
  // in the page: keep it to what a version can be made of.
  if (!/^[A-Za-z0-9._+-]{1,40}$/.test(trimmed)) return "";
  return trimmed;
}

function sanitizeDate(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : "";
}

async function fetchRulesVersion(
  baseUrl: string,
): Promise<EngineRulesVersion | null> {
  const endpoint = `${baseUrl.replace(/\/$/, "")}/rules-version.json`;
  try {
    const response = await fetch(endpoint, {
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const body = (await response.text()).slice(0, MAX_BODY_BYTES);
    const parsed = JSON.parse(body) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const version = sanitize((parsed as Record<string, unknown>).version);
    if (!version) return null;
    return {
      version,
      built: sanitizeDate((parsed as Record<string, unknown>).built),
    };
  } catch {
    return null;
  }
}

export async function readEngineRulesVersion(
  baseUrl: string,
  nowMs = Date.now(),
): Promise<EngineRulesVersion | null> {
  if (cache && cache.expiresAt > nowMs) return cache.value;
  if (inFlight) return inFlight;

  inFlight = fetchRulesVersion(baseUrl)
    .then((value) => {
      cache = {
        value,
        // A miss is retried sooner than a hit is refreshed: the engine may
        // still be starting, and the number does not change on its own.
        expiresAt:
          Date.now() + (value ? CACHE_TTL_MS : FAILURE_BACKOFF_MS),
      };
      return value;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

export function resetEngineRulesVersionCacheForTests(): void {
  cache = null;
  inFlight = null;
}
