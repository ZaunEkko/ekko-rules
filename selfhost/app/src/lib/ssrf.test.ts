import assert from "node:assert/strict";
import test from "node:test";
import { isBlockedIpAddress, parsePublicHttpUrl, redactUrl } from "./ssrf";

test("blocks loopback and private IPv4", () => {
  assert.equal(isBlockedIpAddress("127.0.0.1"), true);
  assert.equal(isBlockedIpAddress("10.0.0.8"), true);
  assert.equal(isBlockedIpAddress("192.168.1.1"), true);
  assert.equal(isBlockedIpAddress("169.254.169.254"), true);
  assert.equal(isBlockedIpAddress("8.8.8.8"), false);
});

test("blocks private IPv4 addresses embedded in every mapped IPv6 form", () => {
  assert.equal(isBlockedIpAddress("::ffff:127.0.0.1"), true);
  assert.equal(isBlockedIpAddress("::ffff:7f00:1"), true);
  assert.equal(isBlockedIpAddress("0:0:0:0:0:ffff:a00:1"), true);
  assert.equal(isBlockedIpAddress("::ffff:c0a8:101"), true);
  assert.equal(isBlockedIpAddress("::ffff:8.8.8.8"), false);
  assert.equal(isBlockedIpAddress("::ffff:808:808"), false);
});

test("blocks complete and non-canonical private IPv6 ranges", () => {
  assert.equal(isBlockedIpAddress("0:0:0:0:0:0:0:1"), true);
  assert.equal(isBlockedIpAddress("fd12:3456::1"), true);
  assert.equal(isBlockedIpAddress("febf::1"), true);
});

test("rejects credentialed or non-http URLs", () => {
  assert.throws(() => parsePublicHttpUrl("ftp://example.com/a"));
  assert.throws(() => parsePublicHttpUrl("https://user:pass@example.com/a"));
  assert.throws(() => parsePublicHttpUrl("https://127.0.0.1/a"));
  assert.throws(() => parsePublicHttpUrl("http://[::ffff:7f00:1]/a"));
});

test("accepts public https URL shape", () => {
  const parsed = parsePublicHttpUrl("https://example.com/sub?token=secret");
  assert.equal(parsed.hostname, "example.com");
  assert.equal(parsed.protocol, "https:");
});

test("redacts subscription paths", () => {
  assert.equal(
    redactUrl("https://example.com/sub?token=secret"),
    "https://example.com/[redacted]",
  );
});
