import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedManagementHost } from "./host-guard";

const lan = {
  deployMode: "lan" as const,
  internalOrigin: "http://web:3000/api/internal/input",
};

test("LAN management accepts local, private and overlay host names", () => {
  for (const hostHeader of [
    "localhost:8787",
    "127.0.0.1:8787",
    "192.168.1.100:8787",
    "10.0.0.5:8787",
    "172.20.0.9:8787",
    "100.101.102.103:8787", // Tailscale CGNAT
    "[::1]:8787",
    "[fd7a:115c:a1e0::1]:8787",
    "desktop.local:8787",
    "web:3000", // engine handoff inside Compose
  ]) {
    assert.equal(isAllowedManagementHost({ ...lan, hostHeader }), true, hostHeader);
  }
});

test("LAN management rejects a rebound public domain", () => {
  for (const hostHeader of [
    "attacker.example.com",
    "rebind.attacker.example.com:8787",
    "8.8.8.8:8787",
    "",
  ]) {
    assert.equal(isAllowedManagementHost({ ...lan, hostHeader }), false, hostHeader);
  }
});

test("LAN management still accepts the operator's advertised origin", () => {
  assert.equal(
    isAllowedManagementHost({
      ...lan,
      hostHeader: "converter.example.com",
      lanBaseUrl: "https://converter.example.com",
    }),
    true,
  );
});

test("one open deployment can answer on several of its own domains", () => {
  const input = {
    deployMode: "public" as const,
    publicBaseUrl: "https://sub.example.com",
    altOrigins: ["https://sub.example.net", "https://convert.example.org"],
    internalOrigin: "http://web:3000/api/internal/input",
  };
  for (const hostHeader of [
    "sub.example.com",
    "sub.example.net",
    "convert.example.org",
  ]) {
    assert.equal(isAllowedManagementHost({ ...input, hostHeader }), true, hostHeader);
  }
  assert.equal(
    isAllowedManagementHost({ ...input, hostHeader: "evil.example.net" }),
    false,
  );
});

test("an open deployment accepts only its own domain", () => {
  const publicInput = {
    deployMode: "public" as const,
    publicBaseUrl: "https://sub.example.com",
    internalOrigin: "http://web:3000/api/internal/input",
  };
  assert.equal(
    isAllowedManagementHost({ ...publicInput, hostHeader: "sub.example.com" }),
    true,
  );
  assert.equal(
    isAllowedManagementHost({ ...publicInput, hostHeader: "web:3000" }),
    true,
  );
  assert.equal(
    isAllowedManagementHost({ ...publicInput, hostHeader: "203.0.113.10" }),
    false,
  );
  assert.equal(
    isAllowedManagementHost({ ...publicInput, hostHeader: "evil.example.net" }),
    false,
  );
});
