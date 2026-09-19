import assert from "node:assert/strict";
import test from "node:test";
import {
  SUPPORTED_TARGETS,
  buildCapabilitiesPayload,
  isSupportedTarget,
  targetDefinition,
} from "./capabilities";
import { parseConvertRequest } from "./convert";

test("publishes the complete-config client targets", () => {
  assert.deepEqual(SUPPORTED_TARGETS, [
    "clash",
    "singbox",
    "surge",
    "quanx",
    "loon",
    "surfboard",
    "quan",
    "mellow",
  ]);
  assert.equal(isSupportedTarget("singbox"), true);
  assert.equal(isSupportedTarget("clashmeta"), false);
  assert.deepEqual(targetDefinition("surge").engineParams, { ver: "4" });
});

test("capabilities describe restart-safe local subscription profiles", () => {
  const payload = buildCapabilitiesPayload();
  assert.equal(payload.supported_targets.length, 8);
  assert.equal(payload.profile_behavior.survives_restart, true);
  assert.equal(payload.profile_behavior.stores_generated_configs, false);
  assert.equal(payload.profile_behavior.auto_update_default, false);
  assert.equal(payload.input_protocol_behavior.automatic_detection, true);
  assert.deepEqual(
    payload.supported_targets
      .filter((target) => target.verified_modern_protocols.includes("AnyTLS"))
      .map((target) => target.id),
    ["clash", "singbox"],
  );
});

test("convert requests accept known targets and reject unknown targets", () => {
  assert.deepEqual(
    parseConvertRequest({
      subscriptionUrl: "https://example.com/subscription",
      target: "singbox",
    }),
    {
      subscriptionUrl: "https://example.com/subscription",
      target: "singbox",
      options: {
        autoUpdate: false,
        emoji: true,
        udp: false,
        xudp: false,
        tfo: false,
        skipCertVerify: false,
        tls13: false,
        sort: false,
        filterUnsupported: true,
        appendType: false,
        include: "",
        exclude: "",
        rename: "",
        customUserAgent: "",
        updateIntervalHours: 24,
        singboxIpv6: false,
      },
      accessPassword: undefined,
    },
  );
  assert.throws(
    () =>
      parseConvertRequest({
        subscriptionUrl: "https://example.com/subscription",
        target: "clashmeta",
      }),
    /supported target/i,
  );
});
