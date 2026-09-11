/**
 * Brand marks for the links in the masthead.
 *
 * Drawn inline: the page promises not to talk to third parties, so it does not
 * fetch icons from one either. The GitHub mark is its published path; the
 * bilibili one is built from primitives rather than copied glyph data, because
 * a mistyped coordinate in a path renders as garbage while a rectangle with
 * two antennae is always the little TV.
 */
export function SiteMark({ url }: { url: string }) {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }

  if (host === "github.com" || host.endsWith(".github.com")) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          fill="currentColor"
          d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
        />
      </svg>
    );
  }

  if (host === "bilibili.com" || host.endsWith(".bilibili.com")) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M7.4 3.3 10 6" />
          <path d="M16.6 3.3 14 6" />
          <rect x="2.6" y="6" width="18.8" height="15" rx="3.4" />
        </g>
        <circle cx="8.6" cy="13.2" r="1.35" fill="currentColor" />
        <circle cx="15.4" cy="13.2" r="1.35" fill="currentColor" />
      </svg>
    );
  }

  return null;
}
