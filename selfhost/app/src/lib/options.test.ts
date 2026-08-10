import assert from "node:assert/strict";
import test from "node:test";
import {
  countEnabledOptions,
  DEFAULT_CONVERT_OPTIONS,
  parseConvertOptions,
} from "./options";

test("uses safe advanced-option defaults", () => {
  const options = parseConvertOptions(undefined);
  assert.deepEqual(options, DEFAULT_CONVERT_OPTIONS);
  assert.equal(options.emoji, true);
  assert.equal(options.filterUnsupported, true);
  assert.equal(options.skipCertVerify, false);
  assert.equal(options.autoUpdate, false);
  assert.equal(options.updateIntervalHours, 24);
});

test("parses converter switches and bounded text options", () => {
  const options = parseConvertOptions({
    autoUpdate: true,
    udp: true,
    xudp: true,
    tfo: true,
    include: " 香港|日本 ",
    customUserAgent: "Mihomo/1.0",
    updateIntervalHours: 12,
  });
  assert.equal(options.udp, true);
  assert.equal(options.xudp, true);
  assert.equal(options.tfo, true);
  assert.equal(options.include, "香港|日本");
  assert.equal(options.updateIntervalHours, 12);
  assert.equal(countEnabledOptions(options), 8);
});

test("rejects invalid option values and control characters", () => {
  assert.throws(() => parseConvertOptions({ udp: "true" }), /boolean/i);
  assert.throws(
    () => parseConvertOptions({ updateIntervalHours: 0 }),
    /1 to 168/i,
  );
  assert.throws(
    () => parseConvertOptions({ customUserAgent: "unsafe\r\nheader" }),
    /control characters/i,
  );
});
