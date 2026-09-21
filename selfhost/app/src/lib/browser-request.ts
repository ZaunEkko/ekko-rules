/**
 * Is this a browser navigating to the address, or a client fetching it?
 *
 * One QR code has to serve both. A client's scan entry stores the address and
 * fetches it, and must get the configuration. A phone camera hands the same
 * address to a browser, which must get a page that can open the client —
 * a browser showing raw YAML helps nobody.
 *
 * Three signals have to agree, because guessing wrong in this direction is
 * the expensive one: a client mistaken for a browser gets an HTML page where
 * it expected a profile, and the import fails. `Sec-Fetch-Mode: navigate` is
 * sent by every current browser on a top-level navigation and by no proxy
 * client; `text/html` in `Accept` and a `Mozilla/5.0` agent are the two older
 * signals that agree with it. A client would have to impersonate a browser in
 * all three at once to be misread.
 */
export function looksLikeBrowserNavigation(headers: Headers): boolean {
  const mode = (headers.get("sec-fetch-mode") || "").trim().toLowerCase();
  if (mode !== "navigate") return false;
  const dest = (headers.get("sec-fetch-dest") || "").trim().toLowerCase();
  // A navigation that is not for a document is a preload or a frame; neither
  // is a person looking at a page.
  if (dest && dest !== "document") return false;
  if (!/text\/html/i.test(headers.get("accept") || "")) return false;
  return /^Mozilla\/5\.0\b/i.test(headers.get("user-agent") || "");
}
