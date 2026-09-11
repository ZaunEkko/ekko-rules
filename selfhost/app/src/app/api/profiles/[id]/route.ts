import { NextResponse } from "next/server";
import {
  authorizeLocalAccess,
  getRuntimeConfig,
  isDeploymentConfigurationError,
  publicErrorMessage,
  safeLog,
} from "@/lib/convert";
import { deleteStoredProfile } from "@/lib/profiles";
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

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
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
    const { id } = await context.params;
    await deleteStoredProfile(id);
    safeLog("profile.deleted");
    return new NextResponse(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = publicErrorMessage(error);
    const status = isDeploymentConfigurationError(message)
      ? 503
      : /password/i.test(message)
        ? 401
        : /not found/i.test(message)
          ? 404
          : 500;
    return NextResponse.json(
      { error: message },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
