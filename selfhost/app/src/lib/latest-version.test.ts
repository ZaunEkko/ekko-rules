import assert from "node:assert/strict";
import test from "node:test";
import {
  compareVersions,
  parseRefTagNames,
  pickLatestTag,
} from "./latest-version";

test("orders versions numerically, not as strings", () => {
  // The reason this function exists: "0.1.10" < "0.1.9" as text.
  assert.equal(compareVersions("0.1.10", "0.1.9") > 0, true);
  assert.equal(compareVersions("0.2.0", "0.1.99") > 0, true);
  assert.equal(compareVersions("1.0.0", "0.9.9") > 0, true);
  assert.equal(compareVersions("0.1.8", "0.1.8"), 0);
  assert.equal(compareVersions("0.1.7", "0.1.8") < 0, true);
});

test("treats a missing segment as zero rather than as smaller", () => {
  assert.equal(compareVersions("1.2", "1.2.0"), 0);
  assert.equal(compareVersions("1.2", "1.2.1") < 0, true);
  assert.equal(compareVersions("1.3", "1.2.9") > 0, true);
});

test("picks the newest selfhost tag and ignores everything else", () => {
  assert.equal(
    pickLatestTag([
      "selfhost-v0.1.9",
      "selfhost-v0.1.10",
      "selfhost-v0.1.2",
      "v2.0.0",
      "rules-v9.9.9",
      "selfhost-vnightly",
    ]),
    "0.1.10",
  );
});

test("says nothing when no tag qualifies", () => {
  assert.equal(pickLatestTag([]), null);
  assert.equal(pickLatestTag(["v1.0.0", "latest", "selfhost-v"]), null);
  // A tag shaped like the prefix but not a version must not be admitted:
  // it would be compared as 0 and could outrank a real version.
  assert.equal(pickLatestTag(["selfhost-v1.0.0-rc1"]), null);
});

test("tag order in the response does not decide the answer", () => {
  const names = ["selfhost-v0.1.10", "selfhost-v0.1.9"];
  assert.equal(pickLatestTag(names), "0.1.10");
  assert.equal(pickLatestTag([...names].reverse()), "0.1.10");
});

test("reads tag names out of a git ref advertisement", () => {
  // Shaped like the real thing: pkt-line lengths, a NUL-delimited capability
  // list on the first ref, peeled entries, and refs that are not tags.
  const NUL = String.fromCharCode(0);
  const body = [
    "001e# service=git-upload-pack",
    "0000015500000000000000000000000000000000 refs/heads/main" + NUL + "multi_ack thin-pack",
    "003f1111111111111111111111111111111111111111 refs/tags/selfhost-v0.2.0",
    "00412222222222222222222222222222222222222222 refs/tags/selfhost-v0.2.0^{}",
    "003f3333333333333333333333333333333333333333 refs/tags/selfhost-v0.2.1",
    "003f4444444444444444444444444444444444444444 refs/tags/selfhost-v0.1.9",
    "0000",
  ].join("\n");

  const names = parseRefTagNames(body);
  assert.deepEqual(names.sort(), [
    "selfhost-v0.1.9",
    "selfhost-v0.2.0",
    "selfhost-v0.2.1",
  ]);
  // A peeled entry names the same tag; it must not leak the caret through.
  assert.equal(
    names.some((name) => name.includes("^")),
    false,
  );
  assert.equal(pickLatestTag(names), "0.2.1");
});

test("a ref advertisement with no tags yields nothing rather than a guess", () => {
  const body = ["001e# service=git-upload-pack", "0000"].join("\n");
  assert.deepEqual(parseRefTagNames(body), []);
  assert.equal(pickLatestTag(parseRefTagNames(body)), null);
});

