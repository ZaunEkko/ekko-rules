import assert from "node:assert/strict";
import test from "node:test";
import { clientRateKey, createRateLimiter } from "./rate-limit";

test("allows requests up to the limit and then reports a retry delay", () => {
  const limiter = createRateLimiter({ limit: 3, windowMs: 60_000 });
  const start = 1_000_000;
  assert.equal(limiter.check("a", start).allowed, true);
  assert.equal(limiter.check("a", start + 1).allowed, true);
  assert.equal(limiter.check("a", start + 2).remaining, 0);

  const blocked = limiter.check("a", start + 3);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 60);

  // A different client keeps its own window.
  assert.equal(limiter.check("b", start + 3).allowed, true);
});

test("starts a fresh window after the current one expires", () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 1_000 });
  const start = 2_000_000;
  assert.equal(limiter.check("a", start).allowed, true);
  assert.equal(limiter.check("a", start + 500).allowed, false);
  assert.equal(limiter.check("a", start + 1_001).allowed, true);
});

test("treats a limit of zero as disabled", () => {
  const limiter = createRateLimiter({ limit: 0, windowMs: 60_000 });
  for (let index = 0; index < 50; index += 1) {
    assert.equal(limiter.check("a", 1).allowed, true);
  }
});

test("uses the proxy-appended peer address and never a spoofed prefix", () => {
  const headers = new Headers({
    "x-forwarded-for": "1.2.3.4, 203.0.113.7",
  });
  assert.equal(clientRateKey(headers, true), "203.0.113.7");
  assert.equal(clientRateKey(headers, false), "shared");

  assert.equal(
    clientRateKey(new Headers({ "x-real-ip": "198.51.100.9" }), true),
    "198.51.100.9",
  );
  assert.equal(clientRateKey(new Headers(), true), "shared");
});
