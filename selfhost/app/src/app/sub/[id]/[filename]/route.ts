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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Scanner-specific Shadowrocket profile representation. */
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
    const configScan = new URL(request.url).searchParams.get("srconfig") === "1";
    const homeYaml = filename.endsWith(".yaml");
    const nativeConfig = filename.endsWith(".conf");
    if (profile.target !== "shadowrocket" || (!homeYaml && !nativeConfig)) {
      throw new Error("Profile not found.");
    }
    const result = await convertSubscription(
      {
        subscriptionUrl: profile.subscriptionUrl,
        // Keep old provider-backed srconfig URLs working after the output
        // contract moved back to native select groups.
        target: nativeConfig || configScan ? "shadowrocket" : "clash",
        options: profile.options,
      },
      { authorize: false, sourceUserAgent: request.headers.get("user-agent") },
    );
    const headers: Record<string, string> = {
      "Content-Type": result.contentType,
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Request-Id": result.requestId,
      "X-Ekko-Target": nativeConfig || configScan
        ? "shadowrocket-config"
        : "shadowrocket-home",
      ...subscriptionMetadataHeaders(profile.name),
    };
    if (profile.options.autoUpdate) {
      headers["Profile-Update-Interval"] = String(profile.options.updateIntervalHours);
    }
    if (result.subscriptionUserinfo) {
      headers["Subscription-Userinfo"] = result.subscriptionUserinfo;
    }
    safeLog("profile.shadowrocket_yaml_success", {
      bytes: result.bytes,
      configScan: nativeConfig || configScan,
    });
    return new NextResponse(result.body, { status: 200, headers });
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
