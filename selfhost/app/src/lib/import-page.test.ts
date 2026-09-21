import assert from "node:assert/strict";
import test from "node:test";
import { renderImportPage } from "./import-page";

const address =
  "https://sub.example.test/i?p=dXJsPWh0dHBzJTNBJTJGJTJGcHJvdmlkZXI&x=1";

test("hands the address to the client the code was made for", () => {
  const page = renderImportPage({
    target: "clash",
    subscriptionUrl: address,
    name: "家里",
    downloadUrl: "/sub?p=dXJs",
  });
  assert.match(page, /clash:\/\/install-config\?url=/);
  assert.match(page, /一键导入 Clash \/ Mihomo/);
  assert.match(page, /家里/);
  // Everything the redirect cannot do for them is on the page as well.
  assert.match(page, /复制地址/);
  assert.match(page, /\/sub\?p=dXJs/);

  const shadowrocket = renderImportPage({
    target: "shadowrocket",
    subscriptionUrl: address,
    name: "",
    downloadUrl: "/sub?p=dXJs",
  });
  assert.match(shadowrocket, /shadowrocket:\/\/config\/add\//);
});

test("offers no button for a client whose vendor documents no scheme", () => {
  const page = renderImportPage({
    target: "quanx",
    subscriptionUrl: address,
    name: "",
    downloadUrl: "/sub?p=dXJs",
  });
  assert.doesNotMatch(page, /class="go"/);
  assert.match(page, /复制/);
  assert.match(page, /Quantumult X/);
});

test("puts nothing on the page that could rewrite it", () => {
  // The name travels in the link, so it is whatever the last person typed.
  const page = renderImportPage({
    target: "clash",
    subscriptionUrl: "https://sub.example.test/i?p=a&b=\"><script>alert(1)</script>",
    name: "</title><script>alert(2)</script>",
    downloadUrl: "/sub?p=a",
  });
  assert.doesNotMatch(page, /<script>alert\(1\)<\/script>/);
  assert.doesNotMatch(page, /<script>alert\(2\)<\/script>/);
  assert.match(page, /&lt;script&gt;alert\(2\)&lt;\/script&gt;/);
  // Inside the script the same value is a JSON string with no way out of it.
  assert.doesNotMatch(page, /var address = "[^"]*<\/script>/);
});
