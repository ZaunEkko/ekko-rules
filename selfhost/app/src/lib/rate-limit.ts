// Small in-memory fixed-window limiter.
//
// A personal deployment runs a single web container, so process-local counters
// are enough: they protect the upstream airport account and the conversion
// engine from a scripted client, not from a distributed flood.

export type RateLimitDecision = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export type RateLimiter = {
  check: (key: string, nowMs?: number) => RateLimitDecision;
  reset: () => void;
};

const MAX_TRACKED_KEYS = 4096;

export function createRateLimiter(options: {
  limit: number;
  windowMs: number;
}): RateLimiter {
  const windows = new Map<string, { count: number; resetAt: number }>();

  function prune(nowMs: number): void {
    for (const [key, window] of windows) {
      if (window.resetAt <= nowMs) windows.delete(key);
    }
    if (windows.size <= MAX_TRACKED_KEYS) return;
    const overflow = windows.size - MAX_TRACKED_KEYS;
    let removed = 0;
    for (const key of windows.keys()) {
      windows.delete(key);
      if (++removed >= overflow) break;
    }
  }

  return {
    check(key: string, nowMs = Date.now()): RateLimitDecision {
      if (options.limit <= 0) {
        return { allowed: true, remaining: Number.POSITIVE_INFINITY, retryAfterSeconds: 0 };
      }
      prune(nowMs);
      const current = windows.get(key);
      if (!current || current.resetAt <= nowMs) {
        windows.set(key, { count: 1, resetAt: nowMs + options.windowMs });
        return { allowed: true, remaining: options.limit - 1, retryAfterSeconds: 0 };
      }
      if (current.count >= options.limit) {
        return {
          allowed: false,
          remaining: 0,
          retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - nowMs) / 1000)),
        };
      }
      current.count += 1;
      return {
        allowed: true,
        remaining: options.limit - current.count,
        retryAfterSeconds: 0,
      };
    },
    reset(): void {
      windows.clear();
    },
  };
}

/**
 * Reverse proxies append the real peer address, so the right-most entry is the
 * only one a client cannot spoof. Without a trusted proxy every request shares
 * one bucket instead of trusting attacker-controlled headers.
 */
export function clientRateKey(
  headers: Headers,
  trustProxyHeaders: boolean,
): string {
  if (!trustProxyHeaders) return "shared";
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const entries = forwardedFor
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const peer = entries.at(-1);
    if (peer) return peer.toLowerCase();
  }
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp.toLowerCase();
  return "shared";
}

export function rateLimitResponseHeaders(
  decision: RateLimitDecision,
): Record<string, string> {
  return {
    "Cache-Control": "no-store",
    "Retry-After": String(decision.retryAfterSeconds),
  };
}
