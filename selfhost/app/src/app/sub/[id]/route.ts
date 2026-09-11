import { NextResponse } from "next/server";
import {
  convertSubscription,
  getRuntimeConfig,
  publicErrorMessage,
  safeLog,
} from "@/lib/convert";
import { readStoredProfile } from "@/lib/profiles";
import {
  RATE_LIMIT_MESSAGE,
  checkSubscribeRate,
} from "@/lib/request-guard";
import { rateLimitResponseHeaders } from "@/lib/rate-limit";
import { STATELESS_ONLY_MESSAGE } from "@/lib/stateless-only";
import { subscriptionMetadataHeaders } from "@/lib/subscription-metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
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
    const { id } = await context.params;
    const profile = await readStoredProfile(id);
    const result = await convertSubscription(
      {
        subscriptionUrl: profile.subscriptionUrl,
        target: profile.target,
        options: profile.options,
      },
      {
        authorize: false,
        sourceUserAgent: request.headers.get("user-agent"),
      },
    );
    const headers: Record<string, string> = {
      "Content-Type": result.contentType,
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Request-Id": result.requestId,
      "X-Ekko-Target": result.target,
      ...subscriptionMetadataHeaders(profile.name, result.filename),
    };
    if (profile.options.autoUpdate) {
      headers["Profile-Update-Interval"] = String(
        profile.options.updateIntervalHours,
      );
    }
    if (result.subscriptionUserinfo) {
      headers["Subscription-Userinfo"] = result.subscriptionUserinfo;
    }
    safeLog("profile.convert_success", {
      target: result.target,
      bytes: result.bytes,
    });
    return new NextResponse(result.body, { status: 200, headers });
  } catch (error) {
    const message = publicErrorMessage(error);
    safeLog("profile.convert_failure", { error: message });
    return NextResponse.json(
      { error: message },
      {
        status: /not found/i.test(message) ? 404 : 502,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
