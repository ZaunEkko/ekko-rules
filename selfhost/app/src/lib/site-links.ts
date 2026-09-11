/**
 * Links shown in the page footer. An open deployment is also the project's
 * front door, so the defaults point back at this repository; an operator can
 * replace them entirely with the SITE_LINKS environment variable.
 */

export type SiteLink = {
  label: string;
  url: string;
};

export const DEFAULT_SITE_LINKS: ReadonlyArray<SiteLink> = [
  { label: "GitHub 项目", url: "https://github.com/ZaunEkko/ekko-rules" },
  { label: "zaunekko.com", url: "https://zaunekko.com" },
  { label: "哔哩哔哩", url: "https://space.bilibili.com/46849942" },
];

const MAX_LINKS = 8;

function cleanLabel(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 40);
}

/**
 * `SITE_LINKS` is a JSON array of `{ label, url }`. An empty array removes the
 * row entirely; malformed entries are dropped instead of failing startup.
 */
export function parseSiteLinks(raw: string | undefined): SiteLink[] {
  const value = (raw || "").trim();
  if (!value) return [...DEFAULT_SITE_LINKS];

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return [...DEFAULT_SITE_LINKS];
  }
  if (!Array.isArray(parsed)) return [...DEFAULT_SITE_LINKS];

  const links: SiteLink[] = [];
  for (const entry of parsed) {
    if (links.length >= MAX_LINKS) break;
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    const label = cleanLabel(item.label);
    const url = typeof item.url === "string" ? item.url.trim() : "";
    if (!label || !/^https:\/\//.test(url)) continue;
    try {
      new URL(url);
    } catch {
      continue;
    }
    links.push({ label, url });
  }
  return links;
}
