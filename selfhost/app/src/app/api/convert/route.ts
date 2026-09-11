import { NextResponse } from "next/server";
import {
  convertSubscription,
  isJsonRequestContentType,
  parseConvertRequest,
  publicErrorMessage,
  publicErrorStatus,
  safeLog,
} from "@/lib/convert";
import {
  HOST_GUARD_MESSAGE,
  RATE_LIMIT_MESSAGE,
  checkManageRate,
  isManagementHostAllowed,
} from "@/lib/request-guard";
import { rateLimitResponseHeaders } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isManagementHostAllowed(request.headers)) {
    return NextResponse.json(
      { error: HOST_GUARD_MESSAGE },
      { status: 403, headers: { "Cache-Control": "no-store" } },
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
    const result = await convertSubscription(parsed, {
      sourceUserAgent: request.headers.get("user-agent"),
    });
    safeLog("convert.success", {
      requestId: result.requestId,
      target: result.target,
      bytes: result.bytes,
    });
    return new NextResponse(result.body, {
      status: 200,
      headers: {
        "Content-Type": result.contentType,
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "X-Request-Id": result.requestId,
        "X-Ekko-Target": result.target,
        ...(result.subscriptionUserinfo
          ? { "Subscription-Userinfo": result.subscriptionUserinfo }
          : {}),
      },
    });
  } catch (error) {
    safeLog("convert.failure", {
      error: publicErrorMessage(error),
    });
    const message = publicErrorMessage(error);
    return NextResponse.json(
      { error: message },
      {
        status: publicErrorStatus(error),
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
