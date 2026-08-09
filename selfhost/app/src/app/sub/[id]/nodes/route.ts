import { NextResponse } from "next/server";
import {
  convertSubscription,
  publicErrorMessage,
  safeLog,
} from "@/lib/convert";
import { readStoredProfile } from "@/lib/profiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const profile = await readStoredProfile(id);
    if (profile.target !== "clash") {
      throw new Error("Profile not found.");
    }

    const result = await convertSubscription(
      {
        subscriptionUrl: profile.subscriptionUrl,
        target: "clash",
        options: profile.options,
      },
      {
        authorize: false,
        outputMode: "clash-provider-nodes",
        sourceUserAgent: request.headers.get("user-agent"),
      },
    );
    safeLog("profile.provider_nodes_success", {
      target: profile.target,
      bytes: result.bytes,
    });
    const headers: Record<string, string> = {
      "Content-Type": result.contentType,
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Request-Id": result.requestId,
      "X-Ekko-Target": "clash-provider-nodes",
    };
    if (profile.options.autoUpdate) {
      headers["Profile-Update-Interval"] = String(
        profile.options.updateIntervalHours,
      );
    }
    if (result.subscriptionUserinfo) {
      headers["Subscription-Userinfo"] = result.subscriptionUserinfo;
    }
    return new NextResponse(result.body, { status: 200, headers });
  } catch (error) {
    const message = publicErrorMessage(error);
    safeLog("profile.provider_nodes_failure", { error: message });
    return NextResponse.json(
      { error: message },
      {
        status: /not found/i.test(message) ? 404 : 502,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
