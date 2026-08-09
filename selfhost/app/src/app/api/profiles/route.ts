import { NextResponse } from "next/server";
import {
  authorizeLocalAccess,
  convertSubscription,
  parseConvertRequest,
  publicErrorMessage,
  publicErrorStatus,
  safeLog,
} from "@/lib/convert";
import {
  createStoredProfile,
  listStoredProfiles,
  publicProfile,
} from "@/lib/profiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    authorizeLocalAccess(request.headers.get("x-ekko-access-password") || undefined);
    return NextResponse.json(
      { profiles: await listStoredProfiles() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = publicErrorMessage(error);
    return NextResponse.json(
      { error: message },
      {
        status: publicErrorStatus(message),
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be JSON." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const parsed = parseConvertRequest(raw);
    const name =
      raw && typeof raw === "object" && "name" in raw
        ? (raw as Record<string, unknown>).name
        : undefined;
    if (name !== undefined && typeof name !== "string") {
      throw new Error("Profile name must be a string when provided.");
    }

    const verified = await convertSubscription(
      parsed,
      parsed.target === "clash"
        ? {
            outputMode: "clash-provider-nodes",
            sourceUserAgent: request.headers.get("user-agent"),
          }
        : { sourceUserAgent: request.headers.get("user-agent") },
    );
    const stored = await createStoredProfile({
      name,
      subscriptionUrl: parsed.subscriptionUrl,
      target: parsed.target,
      options: parsed.options,
    });
    safeLog("profile.created", {
      target: stored.target,
      verifiedBytes: verified.bytes,
    });
    return NextResponse.json(
      { profile: publicProfile(stored), verified_bytes: verified.bytes },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = publicErrorMessage(error);
    safeLog("profile.create_failure", { error: message });
    return NextResponse.json(
      { error: message },
      {
        status: publicErrorStatus(message),
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
