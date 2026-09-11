import { getRuntimeConfig } from "./convert";
import { isAllowedManagementHost } from "./host-guard";
import {
  clientRateKey,
  createRateLimiter,
  type RateLimitDecision,
  type RateLimiter,
} from "./rate-limit";

const WINDOW_MS = 60_000;

type CachedLimiter = { limit: number; limiter: RateLimiter };

const limiters = new Map<string, CachedLimiter>();

function limiterFor(name: string, limit: number): RateLimiter {
  const cached = limiters.get(name);
  if (cached && cached.limit === limit) return cached.limiter;
  const limiter = createRateLimiter({ limit, windowMs: WINDOW_MS });
  limiters.set(name, { limit, limiter });
  return limiter;
}

function check(name: string, limit: number, headers: Headers): RateLimitDecision {
  if (limit <= 0) {
    return { allowed: true, remaining: Number.POSITIVE_INFINITY, retryAfterSeconds: 0 };
  }
  const runtime = getRuntimeConfig();
  return limiterFor(name, limit).check(
    clientRateKey(headers, runtime.trustProxyHeaders),
  );
}

/** Management and one-off conversion endpoints. */
export function checkManageRate(headers: Headers): RateLimitDecision {
  const runtime = getRuntimeConfig();
  return check("manage", runtime.manageRateLimitPerMinute, headers);
}

/** Fixed subscription URLs refreshed by clients. */
export function checkSubscribeRate(headers: Headers): RateLimitDecision {
  const runtime = getRuntimeConfig();
  return check("subscribe", runtime.subscribeRateLimitPerMinute, headers);
}

/**
 * True when the browser reached a management endpoint under a host name this
 * deployment actually answers to.
 */
export function isManagementHostAllowed(headers: Headers): boolean {
  const runtime = getRuntimeConfig();
  return isAllowedManagementHost({
    hostHeader: headers.get("host"),
    deployMode: runtime.deployMode,
    publicBaseUrl:
      runtime.deployMode === "public" ? runtime.subscriptionBaseUrl : undefined,
    lanBaseUrl:
      runtime.deployMode === "public" ? undefined : runtime.subscriptionBaseUrl,
    internalOrigin: runtime.sharedUrlPrefix,
    altOrigins: runtime.altOrigins,
  });
}

export function resetRequestGuards(): void {
  limiters.clear();
}

export const RATE_LIMIT_MESSAGE = "Too many requests. Try again shortly.";

export { HOST_GUARD_MESSAGE } from "./host-guard";
