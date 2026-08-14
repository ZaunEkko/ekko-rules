import { NextResponse } from "next/server";
import { getRuntimeConfig } from "@/lib/convert";
import { readDetectedLanAddress } from "@/lib/host-network";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const runtimeConfig = getRuntimeConfig();
  const detectedLanAddress = await readDetectedLanAddress(
    runtimeConfig.hostNetworkInfoPath,
    runtimeConfig.webPort,
  );
  let subconverterReachable = false;
  try {
    const response = await fetch(`${runtimeConfig.subconverterBaseUrl}/version`, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    });
    subconverterReachable = response.ok;
  } catch {
    subconverterReachable = false;
  }

  return NextResponse.json(
    {
      status: subconverterReachable ? "ok" : "degraded",
      mode: "personal-local-network",
      ekko_rules_version: runtimeConfig.ekkoRulesVersion,
      subconverter_version: runtimeConfig.subconverterVersion,
      subconverter_reachable: subconverterReachable,
      access_password_required: Boolean(runtimeConfig.accessPassword),
      lan_access_enabled: runtimeConfig.lanAccessEnabled,
      subscription_base_url: runtimeConfig.subscriptionBaseUrl || null,
      subscription_base_url_error:
        runtimeConfig.subscriptionBaseUrlError || null,
      detected_lan_ipv4: detectedLanAddress?.ipv4 || null,
      detected_lan_base_url: detectedLanAddress?.baseUrl || null,
      detected_lan_updated_at: detectedLanAddress?.updatedAt || null,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
