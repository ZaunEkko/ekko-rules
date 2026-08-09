import assert from "node:assert/strict";
import test from "node:test";
import { subscriptionMetadataHeaders } from "./subscription-metadata";

test("publishes a stable UTF-8 profile title and filename", () => {
  const headers = subscriptionMetadataHeaders(
    "手机主力订阅",
    "ekko-rules-clash.yaml",
  );

  assert.equal(
    Buffer.from(headers["Profile-Title"].slice("base64:".length), "base64").toString(
      "utf8",
    ),
    "手机主力订阅",
  );
  assert.match(headers["Content-Disposition"], /filename="ekko-rules\.yaml"/);
  assert.match(
    headers["Content-Disposition"],
    /filename\*=UTF-8''%E6%89%8B%E6%9C%BA/,
  );
});

test("uses the chosen ASCII name in the fallback filename", () => {
  const headers = subscriptionMetadataHeaders("tag-ekko", "config.yaml");
  assert.match(headers["Content-Disposition"], /filename="tag-ekko\.yaml"/);
});
