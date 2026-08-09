import { NextResponse } from "next/server";
import {
  convertSubscription,
  publicErrorMessage,
  safeLog,
} from "@/lib/convert";
import { readStoredProfile } from "@/lib/profiles";
import { subscriptionMetadataHeaders } from "@/lib/subscription-metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
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
