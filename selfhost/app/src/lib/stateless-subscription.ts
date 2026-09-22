import { NextResponse } from "next/server";
import {
  convertSubscription,
  getRuntimeConfig,
  publicErrorMessage,
  publicErrorStatus,
  safeLog,
} from "./convert";
import { rateLimitResponseHeaders } from "./rate-limit";
import {
  isCustomRemoteConfig,
  isRemoteConfigTargetSupported,
  resolveRemoteConfig,
} from "./remote-configs";
import { RATE_LIMIT_MESSAGE, checkSubscribeRate } from "./request-guard";
import { recordMetric } from "./metrics";
import { parseStatelessConvertQuery } from "./stateless-request";
import { subscriptionMetadataHeaders } from "./subscription-metadata";

/**
 * Serve a stateless conversion: everything needed comes from the query string,
 * and nothing about the request is stored.
 *
 * Two routes answer with this. `/sub` is the address a client holds, and `/i`
 * is the one a QR code carries — which is the same address to every client,
 * and only becomes a page when a browser is the one asking.
 */
export async function serveStatelessSubscription(
  request: Request,
  logPrefix = "stateless",
): Promise<NextResponse> {
  const rate = checkSubscribeRate(request.headers);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: RATE_LIMIT_MESSAGE },
      { status: 429, headers: rateLimitResponseHeaders(rate) },
    );
  }

  try {
    const runtimeConfig = getRuntimeConfig();
    const requestUrl = new URL(request.url);
    const parsed = parseStatelessConvertQuery(requestUrl.searchParams);
    const providerNodes = requestUrl.searchParams.get("srnodes") === "1" &&
      requestUrl.pathname.endsWith(".nodes.yaml") && parsed.target === "clash";
    const shadowrocketHome = !providerNodes && requestUrl.searchParams.get("srhome") === "1" &&
      requestUrl.pathname.endsWith(".yaml") && parsed.target === "clash";
    const shadowrocketConfig = !providerNodes && !shadowrocketHome &&
      requestUrl.searchParams.get("srconfig") === "1" &&
      requestUrl.pathname.endsWith(".yaml") && parsed.target === "clash";
    // v0.4.24 issued complete-YAML srconfig links. Keep those saved URLs
    // refreshable, but upgrade their response to the native Shadowrocket
    // format where DIRECT and REJECT remain real policy members.
    const conversionTarget = shadowrocketConfig ? "shadowrocket" : parsed.target;
    const preset = resolveRemoteConfig(
      parsed.remoteConfig,
      runtimeConfig.remoteConfigs,
      runtimeConfig.allowCustomRemoteConfig,
    );
    if (!isRemoteConfigTargetSupported(preset, conversionTarget)) {
      throw new Error("remoteConfig is not supported for this target.");
    }

    const result = await convertSubscription(
      {
        subscriptionUrl: parsed.subscriptionUrl,
        target: conversionTarget,
        options: parsed.options,
      },
      {
        authorize: false,
        ...(providerNodes ? { outputMode: "clash-provider-nodes" as const } : {}),
        sourceUserAgent: request.headers.get("user-agent"),
        // Curated entries are values the operator vouched for; a pasted URL is
        // fetched by the gateway instead of being passed to the engine.
        ...(isCustomRemoteConfig(preset)
          ? { remoteConfigFetchUrl: preset.value }
          : { remoteConfigValue: preset.value }),
      },
    );

    // Keep DIRECT and REJECT as native Clash policy literals. Turning them
    // into synthetic proxy objects passes Mihomo validation but Shadowrocket
    // does not expose those objects as built-in selectable policies.
    const body = result.body;
    const headers: Record<string, string> = {
      "Content-Type": result.contentType,
      "Cache-Control": "no-store, no-cache, must-revalidate",
      // The link itself carries the upstream subscription; never leak it on.
      "Referrer-Policy": "no-referrer",
      "X-Request-Id": result.requestId,
      "X-Ekko-Target": providerNodes
        ? "shadowrocket-provider-nodes"
        : shadowrocketConfig
          ? "shadowrocket-config"
          : shadowrocketHome
            ? "shadowrocket-home"
            : result.target,
      ...subscriptionMetadataHeaders(parsed.name),
    };
    if (parsed.options.autoUpdate) {
      headers["Profile-Update-Interval"] = String(
        parsed.options.updateIntervalHours,
      );
    }
    if (result.subscriptionUserinfo) {
      headers["Subscription-Userinfo"] = result.subscriptionUserinfo;
    }

    if (runtimeConfig.metricsEnabled) {
      // Not awaited: writes are serialised, and a client waiting on its config
      // should never queue behind someone else's counter.
      void recordMetric(runtimeConfig.profileDataDir, "conversion");
    }
    safeLog(`${logPrefix}.convert_success`, {
      target: result.target,
      remoteConfig: preset.id,
      bytes: Buffer.byteLength(body, "utf8"),
      shadowrocketConfigRoute: shadowrocketConfig,
      shadowrocketHomeRoute: shadowrocketHome,
      shadowrocketProviderRoute: providerNodes,
      usageMetadataPresent: Boolean(result.subscriptionUserinfo),
    });
    return new NextResponse(body, { status: 200, headers });
  } catch (error) {
    const message = publicErrorMessage(error);
    safeLog(`${logPrefix}.convert_failure`, { error: message });
    return NextResponse.json(
      { error: message },
      {
        status: publicErrorStatus(error),
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
