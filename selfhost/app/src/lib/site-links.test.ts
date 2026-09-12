import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_SITE_LINKS, parseSiteLinks } from "./site-links";

test("falls back to this project's own links", () => {
  assert.deepEqual(parseSiteLinks(undefined), [...DEFAULT_SITE_LINKS]);
  assert.deepEqual(parseSiteLinks("  "), [...DEFAULT_SITE_LINKS]);
  assert.deepEqual(parseSiteLinks("{not json"), [...DEFAULT_SITE_LINKS]);
});

test("an operator can replace or remove the row", () => {
  assert.deepEqual(
    parseSiteLinks(JSON.stringify([{ label: "我的站", url: "https://example.test" }])),
    [{ label: "我的站", url: "https://example.test" }],
  );
  assert.deepEqual(parseSiteLinks("[]"), []);
});

test("drops entries that are not usable https links", () => {
  const links = parseSiteLinks(
    JSON.stringify([
      { label: "ok", url: "https://example.test/a" },
      { label: "", url: "https://example.test/b" },
      { label: "cleartext", url: "http://example.test/c" },
      { label: "script", url: "javascript:alert(1)" },
      { url: "https://example.test/d" },
    ]),
  );
  assert.deepEqual(links, [{ label: "ok", url: "https://example.test/a" }]);
});
