import { NextResponse } from "next/server";
import { buildSiteCapabilities } from "@/lib/site-capabilities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(buildSiteCapabilities(), {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
