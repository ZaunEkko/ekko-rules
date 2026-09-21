import { NextResponse } from "next/server";
import { looksLikeBrowserNavigation } from "@/lib/browser-request";
import { publicErrorMessage, publicErrorStatus, safeLog } from "@/lib/convert";
import { renderImportPage } from "@/lib/import-page";
import { rateLimitResponseHeaders } from "@/lib/rate-limit";
import { RATE_LIMIT_MESSAGE, checkSubscribeRate } from "@/lib/request-guard";
import { parseStatelessConvertQuery } from "@/lib/stateless-request";
import { serveStatelessSubscription } from "@/lib/stateless-subscription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One address for one QR code.
 *
 * A QR code is scanned by two different things and they want opposite
 * answers. A client's own scan entry stores the address and fetches it, so it
 * needs the configuration. A phone camera opens the address in a browser,
 * which can do nothing with a configuration but can hand it to the client.
 * Asking the person which code to scan was the previous answer, and it is a
 * question nobody should have to answer about their own phone.
 *
 * So the code carries this address, and the address answers whoever asks:
 * a browser navigating here gets a page that opens the client, and everyone
 * else gets exactly what `/sub` returns, byte for byte.
 */
export async function GET(request: Request) {
  if (!looksLikeBrowserNavigation(request.headers)) {
    return serveStatelessSubscription(request, "import");
  }

  const rate = checkSubscribeRate(request.headers);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: RATE_LIMIT_MESSAGE },
      { status: 429, headers: rateLimitResponseHeaders(rate) },
    );
  }

  try {
    const url = new URL(request.url);
    // Parsed for the same reasons the conversion parses it: an address this
    // page cannot describe is one it must not offer to install.
    const parsed = parseStatelessConvertQuery(url.searchParams);
    const downloadUrl = `/sub${url.search}`;
    safeLog("import.page", { target: parsed.target });
    return new NextResponse(
      renderImportPage({
        target: parsed.target,
        subscriptionUrl: url.toString(),
        name: parsed.name,
        downloadUrl,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store, no-cache, must-revalidate",
          // The address on the page carries the visitor's own credential.
          "Referrer-Policy": "no-referrer",
          "X-Robots-Tag": "noindex, nofollow",
        },
      },
    );
  } catch (error) {
    const message = publicErrorMessage(error);
    safeLog("import.page_failure", { error: message });
    return NextResponse.json(
      { error: message },
      {
        status: publicErrorStatus(error),
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
