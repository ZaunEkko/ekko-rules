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
  shadowrocketProviderAddress,
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
    const providerOrigin = visibleSubscriptionOrigin(
      request,
      getRuntimeConfig().subscriptionBaseUrl,
      getRuntimeConfig().trustProxyHeaders,
    );
    const body = externalizeShadowrocketProvider(result.body, {
      name: profile.name,
      url: shadowrocketProviderAddress(request.url, providerOrigin),
      intervalHours: profile.options.updateIntervalHours,
    });
    const headers: Record<string, string> = {
      "Content-Type": result.contentType,
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Request-Id": result.requestId,
      "X-Ekko-Target": "shadowrocket-home",
      ...subscriptionMetadataHeaders(profile.name),
    };
    if (profile.options.autoUpdate) {
      headers["Profile-Update-Interval"] = String(profile.options.updateIntervalHours);
    }
    if (result.subscriptionUserinfo) {
      headers["Subscription-Userinfo"] = result.subscriptionUserinfo;
    }
    safeLog("profile.shadowrocket_home_success", { bytes: Buffer.byteLength(body, "utf8") });
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
