import { NextResponse } from "next/server";
import {
  convertSubscription,
  getRuntimeConfig,
  publicErrorMessage,
  safeLog,
} from "@/lib/convert";
import { readStoredProfile } from "@/lib/profiles";
import { rateLimitResponseHeaders } from "@/lib/rate-limit";
import { RATE_LIMIT_MESSAGE, checkSubscribeRate } from "@/lib/request-guard";
import { STATELESS_ONLY_MESSAGE } from "@/lib/stateless-only";
import { subscriptionMetadataHeaders } from "@/lib/subscription-metadata";
import {
  externalizeShadowrocketProvider,
  visibleSubscriptionOrigin,
} from "@/lib/shadowrocket-provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Complete YAML representation for Shadowrocket's homepage scanner. */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; filename: string }> },
) {
  if (!getRuntimeConfig().storedProfilesEnabled) {
    return NextResponse.json(
      { error: STATELESS_ONLY_MESSAGE },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }
  const rate = checkSubscribeRate(request.headers);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: RATE_LIMIT_MESSAGE },
      { status: 429, headers: rateLimitResponseHeaders(rate) },
    );
  }
  try {
    const { id, filename } = await context.params;
    const profile = await readStoredProfile(id);
    if (profile.target !== "shadowrocket" || !filename.endsWith(".yaml")) {
      throw new Error("Profile not found.");
    }
    const result = await convertSubscription(
      {
        subscriptionUrl: profile.subscriptionUrl,
        target: "clash",
        options: profile.options,
      },
      { authorize: false, sourceUserAgent: request.headers.get("user-agent") },
    );
    const configScan = new URL(request.url).searchParams.get("srconfig") === "1";
    const body = configScan
      ? externalizeShadowrocketProvider(result.body, {
          name: profile.name,
          url: new URL(
            `/sub/${encodeURIComponent(id)}/nodes`,
            visibleSubscriptionOrigin(
              request,
              getRuntimeConfig().subscriptionBaseUrl,
              getRuntimeConfig().trustProxyHeaders,
            ),
          ).toString(),
          intervalHours: profile.options.updateIntervalHours,
        })
      : result.body;
    const headers: Record<string, string> = {
      "Content-Type": result.contentType,
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Request-Id": result.requestId,
      "X-Ekko-Target": configScan ? "shadowrocket-config" : "shadowrocket-home",
      ...subscriptionMetadataHeaders(profile.name),
    };
    if (profile.options.autoUpdate) {
      headers["Profile-Update-Interval"] = String(profile.options.updateIntervalHours);
    }
    if (result.subscriptionUserinfo) {
      headers["Subscription-Userinfo"] = result.subscriptionUserinfo;
    }
    safeLog("profile.shadowrocket_yaml_success", {
      bytes: Buffer.byteLength(body, "utf8"),
      configScan,
    });
    return new NextResponse(body, { status: 200, headers });
  } catch (error) {
    const message = publicErrorMessage(error);
    safeLog("profile.shadowrocket_home_failure", { error: message });
    return NextResponse.json(
      { error: message },
      {
        status: /not found/i.test(message) ? 404 : 502,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
