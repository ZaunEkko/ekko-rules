import { NextResponse } from "next/server";
import { getRuntimeConfig } from "@/lib/convert";
import { rateLimitResponseHeaders } from "@/lib/rate-limit";
import { RATE_LIMIT_MESSAGE, checkManageRate } from "@/lib/request-guard";
import { recordMetric } from "@/lib/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Counts one page view. The browser sends this once per session; nothing about
 * the request is kept beyond adding one to two integers.
 */
export async function POST(request: Request) {
  const runtimeConfig = getRuntimeConfig();
  if (!runtimeConfig.metricsEnabled) {
    return new NextResponse(null, { status: 404 });
  }
  const rate = checkManageRate(request.headers);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: RATE_LIMIT_MESSAGE },
      { status: 429, headers: rateLimitResponseHeaders(rate) },
    );
  }
  await recordMetric(runtimeConfig.profileDataDir, "visit");
  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}
