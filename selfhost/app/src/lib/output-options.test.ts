import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_CONVERT_OPTIONS } from "./options";
import {
  applyTargetOutputOptions,
  forceMihomoXudp,
} from "./output-options";

test("forces XUDP only for compatible Mihomo proxy types", () => {
  const input = [
    "proxies:",
    "  - {name: VLESS, type: vless, xudp: false}",
    "  - {name: VMess, type: vmess, packet-encoding: packetaddr}",
    "  - {name: SS, type: ss, udp: true}",
    "  - name: Block VLESS",
    "    type: vless",
    "    server: 203.0.113.1",
    "  - name: AnyTLS",
    "    type: anytls",
    "    server: 203.0.113.2",
    "proxy-groups:",
    "  - name: Select",
    "    type: select",
    "rules:",
    "  - MATCH,Select",
    "",
  ].join("\n");

  const output = forceMihomoXudp(input);
  assert.match(output, /name: VLESS, type: vless, xudp: true/);
  assert.match(output, /name: VMess, type: vmess, packet-encoding: xudp/);
  assert.match(output, /name: SS, type: ss, udp: true/);
  assert.match(
    output,
    /name: Block VLESS\n    type: vless\n    server: 203\.0\.113\.1\n    packet-encoding: xudp/,
  );
  assert.doesNotMatch(output, /name: AnyTLS[\s\S]*?packet-encoding: xudp/);
});

test("leaves Mihomo XUDP selection automatic unless forcing is enabled", () => {
  const input = "proxies:\n  - {name: VLESS, type: vless, xudp: false}\n";
  assert.equal(
    applyTargetOutputOptions(input, "clash", DEFAULT_CONVERT_OPTIONS),
    input,
  );
});

test("applies sing-box XUDP and disables its IPv6 surfaces", () => {
  const input = JSON.stringify({
    dns: {
      rules: [{ query_type: ["A", "AAAA"], server: "dns_fakeip" }],
      fakeip: {
        inet4_range: "198.18.0.0/15",
        inet6_range: "fc00::/18",
      },
    },
    inbounds: [
      {
        type: "tun",
        inet4_address: "172.19.0.1/30",
        inet6_address: "fdfe:dcba:9876::1/126",
        address: ["172.20.0.1/30", "fd00::1/126"],
      },
    ],
    outbounds: [
      { type: "vless", tag: "VLESS" },
      { type: "vmess", tag: "VMess", packet_encoding: "packetaddr" },
      { type: "hysteria2", tag: "Hysteria2" },
    ],
    route: { rules: [] },
  });

  const output = applyTargetOutputOptions(input, "singbox", {
    ...DEFAULT_CONVERT_OPTIONS,
    xudp: true,
    singboxIpv6: false,
  });
  const parsed = JSON.parse(output);
  assert.deepEqual(parsed.dns.rules[0].query_type, ["A"]);
  assert.equal(parsed.dns.fakeip.inet6_range, undefined);
  assert.equal(parsed.inbounds[0].inet6_address, undefined);
  assert.deepEqual(parsed.inbounds[0].address, ["172.20.0.1/30"]);
  assert.equal(parsed.outbounds[0].packet_encoding, "xudp");
  assert.equal(parsed.outbounds[1].packet_encoding, "xudp");
  assert.equal(parsed.outbounds[2].packet_encoding, undefined);
});

test("preserves sing-box IPv6 when the option is enabled", () => {
  const input = JSON.stringify({
    dns: { fakeip: { inet6_range: "fc00::/18" } },
    inbounds: [{ type: "tun", inet6_address: "fd00::1/126" }],
    outbounds: [],
    route: { rules: [] },
  });
  assert.equal(
    applyTargetOutputOptions(input, "singbox", {
      ...DEFAULT_CONVERT_OPTIONS,
      singboxIpv6: true,
    }),
    input,
  );
});
