import assert from "node:assert/strict";
import test from "node:test";
import { looksLikeBrowserNavigation } from "./browser-request";

function headers(values: Record<string, string>): Headers {
  return new Headers(values);
}

const BROWSER = {
  "sec-fetch-mode": "navigate",
  "sec-fetch-dest": "document",
  accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,*/*;q=0.8",
  "user-agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
};

test("a phone opening the address is a browser", () => {
  assert.equal(looksLikeBrowserNavigation(headers(BROWSER)), true);
  assert.equal(
    looksLikeBrowserNavigation(
      headers({
        ...BROWSER,
        "user-agent":
          "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/128 Mobile Safari/537.36",
      }),
    ),
    true,
  );
});

test("a client fetching the address is never mistaken for one", () => {
  // Getting this wrong hands a client an HTML page where it expected a
  // profile, so every one of these has to be read as a client.
  const clients: Array<Record<string, string>> = [
    { "user-agent": "clash-verge-rev/2.4.3" },
    { "user-agent": "ClashMetaForAndroid/2.11.15.Meta", accept: "*/*" },
    { "user-agent": "Shadowrocket/2.2.70 CFNetwork/1568 Darwin/24.0.0" },
    { "user-agent": "Stash/3.1.0 Clash/1.10.0", accept: "text/html" },
    { "user-agent": "okhttp/4.12.0" },
    {},
    // A client that borrows a browser's agent still does not navigate.
    { "user-agent": BROWSER["user-agent"], accept: BROWSER.accept },
    // A browser's own subresource fetch is not a person arriving either.
    { ...BROWSER, "sec-fetch-mode": "cors", "sec-fetch-dest": "empty" },
    { ...BROWSER, "sec-fetch-dest": "iframe" },
    { ...BROWSER, accept: "*/*" },
  ];
  for (const client of clients) {
    assert.equal(
      looksLikeBrowserNavigation(headers(client)),
      false,
      `read as a browser: ${JSON.stringify(client)}`,
    );
  }
});

test("a navigation that omits sec-fetch-dest still counts", () => {
  const { "sec-fetch-dest": _dest, ...rest } = BROWSER;
  assert.equal(looksLikeBrowserNavigation(headers(rest)), true);
});
