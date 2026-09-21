import { clientInstallLabel, qrImportValue } from "./qr-import";
import { targetDefinition, type TargetFormat } from "./capabilities";

/**
 * The page a phone's camera lands on.
 *
 * Scanning a QR code with the camera opens a browser, and a browser cannot
 * install a profile — only the client can. So this page exists to hand the
 * address on: it tries the client's own scheme immediately, and shows a
 * button for the case where the browser wants a tap first (Safari usually
 * does). Everything else on it is for when that fails: the address in full,
 * a copy button, and the file itself.
 *
 * It is one file with no assets, because it renders on a phone that is
 * probably about to leave it again.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Safe inside a <script> string literal, including a stray `</script>`. */
function escapeScriptString(value: string): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function renderImportPage(input: {
  target: TargetFormat;
  /** The address the client should end up holding. */
  subscriptionUrl: string;
  /** What the person called this link, if anything. */
  name: string;
  /** Where the raw configuration can be fetched, for a manual download. */
  downloadUrl: string;
}): string {
  const definition = targetDefinition(input.target);
  const scheme = qrImportValue(
    input.target,
    input.subscriptionUrl,
    "install",
    input.name,
  );
  const hasScheme = scheme !== input.subscriptionUrl;
  const title = input.name.trim() || `${definition.label} 配置`;
  const buttonLabel = clientInstallLabel(input.target) || "打开客户端";

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light; --ink: #12121a; --line: #d8d8d2; --paper: #f6f5f1; --blue: #1b1be0; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 2rem 1rem 3rem; background: var(--paper); color: var(--ink);
         font: 15px/1.7 ui-sans-serif, system-ui, "PingFang SC", "Microsoft YaHei", sans-serif; }
  main { max-width: 26rem; margin: 0 auto; display: grid; gap: 1.1rem; }
  h1 { margin: 0; font-size: 1.3rem; letter-spacing: -.01em; }
  p { margin: 0; color: #4a4a55; font-size: .88rem; }
  a.go { display: block; padding: .85rem 1rem; border-radius: .6rem; background: var(--blue);
         color: #fff; font-weight: 700; text-align: center; text-decoration: none; }
  .box { display: grid; gap: .5rem; padding: .8rem .9rem; border: 1px solid var(--line);
         border-radius: .6rem; background: #fff; }
  .box b { font-size: .7rem; letter-spacing: .04em; color: #7a7a85; font-weight: 700; }
  code { overflow-wrap: anywhere; font: .74rem/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
  button { padding: .5rem .8rem; border: 1px solid var(--line); border-radius: .5rem;
           background: var(--paper); font: inherit; font-size: .8rem; cursor: pointer; }
  small { color: #7a7a85; font-size: .74rem; line-height: 1.6; }
  a.plain { color: var(--blue); }
</style>
</head>
<body>
<main>
  <h1>${escapeHtml(title)}</h1>
  <p>${
    hasScheme
      ? `这是一份 ${escapeHtml(definition.label)} 配置。下面的按钮会把它交给客户端。`
      : `这是一份 ${escapeHtml(definition.label)} 配置。复制下面的地址，粘贴到客户端里。`
  }</p>
  ${hasScheme ? `<a class="go" href="${escapeHtml(scheme)}">${escapeHtml(buttonLabel)}</a>` : ""}
  <div class="box">
    <b>远程订阅地址</b>
    <code id="address">${escapeHtml(input.subscriptionUrl)}</code>
    <button type="button" id="copy">复制地址</button>
  </div>
  <p><a class="plain" href="${escapeHtml(input.downloadUrl)}">或者直接下载这份配置文件</a></p>
  <small>这条地址带着你的订阅凭据，只导入自己的客户端，不要转发。</small>
</main>
<script>
(function () {
  var address = ${escapeScriptString(input.subscriptionUrl)};
  var scheme = ${escapeScriptString(hasScheme ? scheme : "")};
  var copy = document.getElementById("copy");
  copy.addEventListener("click", function () {
    var done = function () { copy.textContent = "已复制"; };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(address).then(done, function () {});
      return;
    }
    var field = document.createElement("textarea");
    field.value = address;
    document.body.appendChild(field);
    field.select();
    try { document.execCommand("copy"); done(); } catch (error) {}
    document.body.removeChild(field);
  });
  // Tried once, on arrival. A browser that refuses without a tap leaves the
  // button above, which is why the button is not just a fallback link.
  if (scheme) {
    setTimeout(function () { window.location.href = scheme; }, 120);
  }
})();
</script>
</body>
</html>
`;
}
