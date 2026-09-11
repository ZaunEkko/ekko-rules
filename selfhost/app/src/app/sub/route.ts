import { NextResponse } from "next/server";
import {
  convertSubscription,
  getRuntimeConfig,
  publicErrorMessage,
  publicErrorStatus,
  safeLog,
} from "@/lib/convert";
import { rateLimitResponseHeaders } from "@/lib/rate-limit";
import { isCustomRemoteConfig, resolveRemoteConfig } from "@/lib/remote-configs";
import { assertPublicHostname } from "@/lib/ssrf";
import { RATE_LIMIT_MESSAGE, checkSubscribeRate } from "@/lib/request-guard";
import { recordMetric } from "@/lib/metrics";
import { parseStatelessConvertQuery } from "@/lib/stateless-request";
import { subscriptionMetadataHeaders } from "@/lib/subscription-metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stateless subscription entry: everything needed for the conversion comes
 * from the query string, and nothing about the request is stored.
 */
export async function GET(request: Request) {
  const rate = checkSubscribeRate(request.headers);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: RATE_LIMIT_MESSAGE },
      { status: 429, headers: rateLimitResponseHeaders(rate) },
    );
  }

  try {
    const runtimeConfig = getRuntimeConfig();
    const parsed = parseStatelessConvertQuery(new URL(request.url).searchParams);
    const preset = resolveRemoteConfig(
      parsed.remoteConfig,
      runtimeConfig.remoteConfigs,
      runtimeConfig.allowCustomRemoteConfig,
    );
    if (isCustomRemoteConfig(preset)) {
      // The engine, not the visitor's browser, performs this fetch, so a
      // pasted config host goes through the same private-address checks as a
      // subscription host.
      try {
        await assertPublicHostname(new URL(preset.value).hostname);
      } catch {
        throw new Error("remoteConfig host is not allowed.");
      }
    }

    const result = await convertSubscription(
      {
        subscriptionUrl: parsed.subscriptionUrl,
        target: parsed.target,
        options: parsed.options,
      },
      {
        authorize: false,
        sourceUserAgent: request.headers.get("user-agent"),
        remoteConfigValue: preset.value,
      },
    );

    const headers: Record<string, string> = {
      "Content-Type": result.contentType,
      "Cache-Control": "no-store, no-cache, must-revalidate",
      // The link itself carries the upstream subscription; never leak it on.
      "Referrer-Policy": "no-referrer",
      "X-Request-Id": result.requestId,
      "X-Ekko-Target": result.target,
      ...subscriptionMetadataHeaders(parsed.name, result.filename),
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
    safeLog("stateless.convert_success", {
      target: result.target,
      remoteConfig: preset.id,
      bytes: result.bytes,
    });
    return new NextResponse(result.body, { status: 200, headers });
  } catch (error) {
    const message = publicErrorMessage(error);
    safeLog("stateless.convert_failure", { error: message });
    return NextResponse.json(
      { error: message },
      {
        status: publicErrorStatus(error),
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
