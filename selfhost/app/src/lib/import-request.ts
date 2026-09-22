import { NextResponse } from "next/server";
import { looksLikeBrowserNavigation } from "./browser-request";
import {
  getRuntimeConfig,
  publicErrorMessage,
  publicErrorStatus,
  safeLog,
} from "./convert";
import { importPageAddress, renderImportPage } from "./import-page";
import { rateLimitResponseHeaders } from "./rate-limit";
import { RATE_LIMIT_MESSAGE, checkSubscribeRate } from "./request-guard";
import {
  buildStatelessConvertQuery,
  clientImportPath,
  packStatelessQuery,
  parseStatelessConvertQuery,
  STATELESS_SUBSCRIPTION_PATH,
} from "./stateless-request";
import { serveStatelessSubscription } from "./stateless-subscription";

/** Shared by `/i` and the named `/i/<profile>.conf` compatibility route. */
export async function handleImportRequest(request: Request) {
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
    const parsed = parseStatelessConvertQuery(url.searchParams);
    // A system-camera navigation should install the native config, while the
    // very same QR is fetched as complete YAML by the home-page scanner.
    const shadowrocketYaml =
      (url.searchParams.get("srhome") === "1" ||
        url.searchParams.get("srconfig") === "1") &&
      url.pathname.endsWith(".yaml") && parsed.target === "clash";
    const nativeQuery = shadowrocketYaml
      ? buildStatelessConvertQuery({
          subscriptionUrl: parsed.subscriptionUrl,
          target: "shadowrocket",
          options: parsed.options,
          name: parsed.name,
          remoteConfig: parsed.remoteConfig,
        })
      : "";
    const nativeUrl = shadowrocketYaml
      ? new URL(
          clientImportPath("shadowrocket", parsed.name, packStatelessQuery(nativeQuery)),
          url,
        )
      : url;
    const address = importPageAddress(getRuntimeConfig().subscriptionBaseUrl, nativeUrl);
    safeLog("import.page", { target: parsed.target });
    return new NextResponse(
      renderImportPage({
        target: shadowrocketYaml ? "shadowrocket" : parsed.target,
        subscriptionUrl: address,
        name: parsed.name,
        downloadUrl: `${STATELESS_SUBSCRIPTION_PATH}${nativeUrl.search}`,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store, no-cache, must-revalidate",
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
