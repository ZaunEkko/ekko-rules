import assert from "node:assert/strict";
import test from "node:test";
import { subscriptionMetadataHeaders } from "./subscription-metadata";

test("publishes a stable UTF-8 profile title and filename", () => {
  const headers = subscriptionMetadataHeaders("手机主力订阅");

  assert.equal(
    Buffer.from(headers["Profile-Title"].slice("base64:".length), "base64").toString(
      "utf8",
    ),
    "手机主力订阅",
  );
  assert.match(headers["Content-Disposition"], /filename="ekko-rules"/);
  assert.match(
    headers["Content-Disposition"],
    /filename\*=UTF-8''%E6%89%8B%E6%9C%BA/,
  );
});

test("uses the chosen ASCII name in the fallback filename", () => {
  const headers = subscriptionMetadataHeaders("tag-ekko");
  assert.match(headers["Content-Disposition"], /filename="tag-ekko"/);
});

test("publishes no file extension, so clients do not name the profile after one", () => {
  for (const name of ["", "手机主力订阅", "tag-ekko"]) {
    const disposition = subscriptionMetadataHeaders(name)["Content-Disposition"];
    assert.doesNotMatch(disposition, /\.(yaml|json|conf|txt)\b/);
  }
});
