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
/**
 * Tags come from git's ref advertisement, not the REST API.
 *
 * Anonymous api.github.com allows 60 requests an hour per address, and this
 * server makes the call on every visitor's behalf, so a REST lookup per page
 * load would stop working for everyone the moment the site saw sixty visits in
 * an hour. The ref advertisement is what `git ls-remote` reads; it is not
 * metered that way, and at roughly 6 KB it costs less than the page itself.
 * That is what makes "check on every load" affordable rather than merely
 * desirable.
 */
const REFS_URL = `https://github.com/${REPO}.git/info/refs?service=git-upload-pack`;
const REPO_URL = `https://api.github.com/repos/${REPO}`;
const TAG_PREFIX = "selfhost-v";
/**
 * There is no freshness interval: every load asks.
 *
 * The first version of this cached for half an hour while the update timer
 * pulls every five minutes, so for up to thirty minutes after a tag the page
 * stated that a deployment was current when it was not — the exact thing the
 * check exists to prevent. Any interval reintroduces some window of that.
 *
 * What remains is a failure backoff. When the lookup is failing, asking again
 * on every load would make each visitor wait out the timeout for an answer
 * that is not coming, so a failure is held for a minute and the last known
 * value is served in the meantime.
 */
const FAILURE_BACKOFF_MS = 60 * 1000;
const STARS_REFRESH_MS = 30 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 4_000;

export type LatestVersion = {
  latest: string | null;
  checkedAt: number;
};

let cached: LatestVersion = { latest: null, checkedAt: 0 };
let inFlight: Promise<LatestVersion> | null = null;
let lastFailureAt = 0;

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

/**
 * Tag names out of a git ref advertisement.
 *
 * The response is pkt-line framed and carries NUL bytes, so it is scanned for
 * ref names rather than parsed as a document. Peeled entries (`...^{}`) name
 * the same tag and fall out in the de-duplication.
 */
export function parseRefTagNames(body: string): string[] {
  const names = new Set<string>();
  // No regex: a ref name ends at the first character git forbids in one,
  // which is the NUL or newline the pkt-line framing puts there, or the
  // caret of a peeled entry. Scanning for that is clearer than escaping it.
  const forbidden = "~^:?*[" + '\\';
  for (const chunk of body.split("refs/tags/").slice(1)) {
    let name = "";
    for (const ch of chunk) {
      if (ch <= " " || forbidden.includes(ch)) break;
      name += ch;
    }
    if (name) names.add(name);
  }
  return [...names];
}

async function fetchLatest(): Promise<LatestVersion> {
  try {
    const response = await fetch(REFS_URL, {
      headers: { "user-agent": "git/2.0 (ekko-rules-selfhost)" },
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return { latest: cached.latest, checkedAt: 0 };
    const latest = pickLatestTag(parseRefTagNames(await response.text()));
    // A response that parsed but named no version is as uninformative as a
    // failed one, so it is not recorded as a successful check either.
    if (!latest) return { latest: cached.latest, checkedAt: 0 };
    return { latest, checkedAt: Date.now() };
  } catch {
    // A failed check keeps whatever was known before; it never clears it.
    // checkedAt stays 0 so the backoff, not the answer, decides what happens
    // next — see lastFailureAt.
    return { latest: cached.latest, checkedAt: 0 };
  }
}

/**
 * The newest published version, checked on every call.
 *
 * Concurrent callers share one request, so several people opening the page at
 * the same moment still make one lookup; sequential loads each get a fresh
 * answer, which is the point.
 */
export async function readLatestVersion(): Promise<LatestVersion> {
  if (inFlight) return inFlight;
  if (Date.now() - lastFailureAt < FAILURE_BACKOFF_MS) return cached;
  inFlight = fetchLatest().then((result) => {
    if (result.checkedAt) {
      cached = result;
      lastFailureAt = 0;
    } else {
      lastFailureAt = Date.now();
    }
    inFlight = null;
    return cached;
  });
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
  if (Date.now() - cachedStars.checkedAt < STARS_REFRESH_MS) {
    return cachedStars.stars;
  }
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
  lastFailureAt = 0;
  cachedStars = { stars: null, checkedAt: 0 };
  starsInFlight = null;
}
