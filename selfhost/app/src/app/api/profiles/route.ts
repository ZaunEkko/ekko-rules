import { NextResponse } from "next/server";
import {
  authorizeLocalAccess,
  getRuntimeConfig,
  convertSubscription,
  isJsonRequestContentType,
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
import {
  HOST_GUARD_MESSAGE,
  RATE_LIMIT_MESSAGE,
  checkManageRate,
  isManagementHostAllowed,
} from "@/lib/request-guard";
import { rateLimitResponseHeaders } from "@/lib/rate-limit";
import { STATELESS_ONLY_MESSAGE } from "@/lib/stateless-only";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isManagementHostAllowed(request.headers)) {
    return NextResponse.json(
      { error: HOST_GUARD_MESSAGE },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!getRuntimeConfig().storedProfilesEnabled) {
    return NextResponse.json(
      { error: STATELESS_ONLY_MESSAGE },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }
  const rate = checkManageRate(request.headers);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: RATE_LIMIT_MESSAGE },
      { status: 429, headers: rateLimitResponseHeaders(rate) },
    );
  }
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
        status: publicErrorStatus(error),
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}

export async function POST(request: Request) {
  if (!isManagementHostAllowed(request.headers)) {
    return NextResponse.json(
      { error: HOST_GUARD_MESSAGE },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!getRuntimeConfig().storedProfilesEnabled) {
    return NextResponse.json(
      { error: STATELESS_ONLY_MESSAGE },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }
  const rate = checkManageRate(request.headers);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: RATE_LIMIT_MESSAGE },
      { status: 429, headers: rateLimitResponseHeaders(rate) },
    );
  }
  if (!isJsonRequestContentType(request.headers.get("content-type"))) {
    return NextResponse.json(
      { error: "Content-Type must be application/json." },
      { status: 415, headers: { "Cache-Control": "no-store" } },
    );
  }

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
        status: publicErrorStatus(error),
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
