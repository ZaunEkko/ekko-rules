/**
 * What the newest published image is, so a visitor can tell whether this
 * deployment has caught up with it.
 *
 * The version baked into the running image says what is being served; on its
 * own it does not say whether that is current. A tag can be published minutes
 * before the server pulls it, and until this check existed the only way to know
 * was to open GitHub and compare by eye.
 *
 * The lookup is made by this server, never by the visitor's browser. That is
 * the same rule the rest of the page follows: the page promises not to talk to
 * third parties, so it does not make the visitor's browser do it either.
 *
 * Failure is not an error state. If GitHub is unreachable, rate-limits us, or
 * answers with something unexpected, the page simply says nothing about the
 * latest version rather than showing an alarm the visitor cannot act on.
 */

const REPO = "ZaunEkko/ekko-rules";
const TAGS_URL = `https://api.github.com/repos/${REPO}/tags?per_page=20`;
const REPO_URL = `https://api.github.com/repos/${REPO}`;
const TAG_PREFIX = "selfhost-v";
const REFRESH_MS = 30 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 4_000;

export type LatestVersion = {
  latest: string | null;
  checkedAt: number;
};

let cached: LatestVersion = { latest: null, checkedAt: 0 };
let inFlight: Promise<LatestVersion> | null = null;

/** `0.1.10` sorts above `0.1.9`, which a string comparison gets wrong. */
export function compareVersions(a: string, b: string): number {
  const parse = (value: string) =>
    value.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const left = parse(a);
  const right = parse(b);
  const width = Math.max(left.length, right.length);
  for (let i = 0; i < width; i += 1) {
    const diff = (left[i] || 0) - (right[i] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

export function pickLatestTag(names: readonly string[]): string | null {
  const versions = names
    .filter((name) => name.startsWith(TAG_PREFIX))
    .map((name) => name.slice(TAG_PREFIX.length))
    .filter((version) => /^\d+(\.\d+)*$/.test(version));
  if (!versions.length) return null;
  return versions.reduce((best, current) =>
    compareVersions(current, best) > 0 ? current : best,
  );
}

async function fetchLatest(): Promise<LatestVersion> {
  try {
    const response = await fetch(TAGS_URL, {
      headers: { accept: "application/vnd.github+json" },
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return { latest: cached.latest, checkedAt: Date.now() };
    const body: unknown = await response.json();
    if (!Array.isArray(body)) return { latest: cached.latest, checkedAt: Date.now() };
    const names = body
      .map((entry) =>
        entry && typeof entry === "object" && typeof (entry as { name?: unknown }).name === "string"
          ? (entry as { name: string }).name
          : "",
      )
      .filter(Boolean);
    return { latest: pickLatestTag(names) ?? cached.latest, checkedAt: Date.now() };
  } catch {
    // A failed check keeps whatever was known before; it never clears it.
    return { latest: cached.latest, checkedAt: Date.now() };
  }
}

/**
 * The newest published version, refreshed at most every half hour.
 *
 * Concurrent callers share one request: a page that several people open at once
 * should not turn into several calls to someone else's API.
 */
export async function readLatestVersion(): Promise<LatestVersion> {
  if (Date.now() - cached.checkedAt < REFRESH_MS) return cached;
  if (!inFlight) {
    inFlight = fetchLatest().then((result) => {
      cached = result;
      inFlight = null;
      return result;
    });
  }
  return inFlight;
}


/**
 * How many people have starred the repository.
 *
 * The page cannot star anything on a visitor's behalf — that needs a GitHub
 * login and, from a third party, an OAuth grant this site has no business
 * asking for. What it can do is show the count and hand over to GitHub, which
 * is why this is a number next to a link rather than a button.
 *
 * Read by this server on the same terms as the version check: cached, shared
 * between concurrent callers, and silent when it fails.
 */
let cachedStars: { stars: number | null; checkedAt: number } = {
  stars: null,
  checkedAt: 0,
};
let starsInFlight: Promise<number | null> | null = null;

async function fetchStars(): Promise<number | null> {
  try {
    const response = await fetch(REPO_URL, {
      headers: { accept: "application/vnd.github+json" },
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return cachedStars.stars;
    const body: unknown = await response.json();
    const count =
      body && typeof body === "object"
        ? (body as { stargazers_count?: unknown }).stargazers_count
        : undefined;
    return typeof count === "number" && Number.isFinite(count) && count >= 0
      ? Math.trunc(count)
      : cachedStars.stars;
  } catch {
    return cachedStars.stars;
  }
}

export async function readRepoStars(): Promise<number | null> {
  if (Date.now() - cachedStars.checkedAt < REFRESH_MS) return cachedStars.stars;
  if (!starsInFlight) {
    starsInFlight = fetchStars().then((stars) => {
      cachedStars = { stars, checkedAt: Date.now() };
      starsInFlight = null;
      return stars;
    });
  }
  return starsInFlight;
}

export function resetLatestVersionCacheForTests(): void {
  cached = { latest: null, checkedAt: 0 };
  inFlight = null;
  cachedStars = { stars: null, checkedAt: 0 };
  starsInFlight = null;
}
