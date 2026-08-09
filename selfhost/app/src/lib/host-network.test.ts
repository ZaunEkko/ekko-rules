import assert from "node:assert/strict";
import test from "node:test";
import {
  isPrivateLanIpv4,
  parseDetectedLanAddress,
} from "./host-network";

test("accepts private LAN IPv4 addresses and rejects public or malformed addresses", () => {
  assert.equal(isPrivateLanIpv4("192.168.6.224"), true);
  assert.equal(isPrivateLanIpv4("10.20.30.40"), true);
  assert.equal(isPrivateLanIpv4("172.16.0.1"), true);
  assert.equal(isPrivateLanIpv4("172.31.255.254"), true);
  assert.equal(isPrivateLanIpv4("172.32.0.1"), false);
  assert.equal(isPrivateLanIpv4("192.168.176.3"), true);
  assert.equal(isPrivateLanIpv4("192.168.65.254"), true);
  assert.equal(isPrivateLanIpv4("8.8.8.8"), false);
  assert.equal(isPrivateLanIpv4("192.168.1.999"), false);
});

test("builds the detected subscription origin from trusted host metadata", () => {
  const nowMs = Date.parse("2026-08-09T12:00:20.000Z");
  assert.deepEqual(
    parseDetectedLanAddress(
      { ipv4: "192.168.6.224", updatedAt: "2026-08-09T12:00:00.000Z" },
      8787,
      nowMs,
    ),
    {
      ipv4: "192.168.6.224",
      baseUrl: "http://192.168.6.224:8787",
      updatedAt: "2026-08-09T12:00:00.000Z",
    },
  );
  assert.equal(
    parseDetectedLanAddress(
      { ipv4: "203.0.113.5", updatedAt: "2026-08-09T12:00:20.000Z" },
      8787,
      nowMs,
    ),
    null,
  );
});

test("rejects stale, missing, or implausibly future LAN address metadata", () => {
  const nowMs = Date.parse("2026-08-09T12:01:00.000Z");
  assert.equal(
    parseDetectedLanAddress(
      { ipv4: "192.168.6.224", updatedAt: "2026-08-09T12:00:29.999Z" },
      8787,
      nowMs,
    ),
    null,
  );
  assert.equal(
    parseDetectedLanAddress({ ipv4: "192.168.6.224" }, 8787, nowMs),
    null,
  );
  assert.equal(
    parseDetectedLanAddress(
      { ipv4: "192.168.6.224", updatedAt: "2026-08-09T12:01:05.001Z" },
      8787,
      nowMs,
    ),
    null,
  );
});
