import { NextResponse } from "next/server";
import { buildCapabilitiesPayload } from "@/lib/capabilities";
import { getRuntimeConfig } from "@/lib/convert";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const runtime = getRuntimeConfig();
  return NextResponse.json(
    {
      ...buildCapabilitiesPayload(),
      ekko_rules_version: runtime.ekkoRulesVersion,
      subconverter_version: runtime.subconverterVersion,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
