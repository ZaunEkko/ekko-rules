import { NextResponse } from "next/server";
import { buildCapabilitiesPayload } from "@/lib/capabilities";
import { getRuntimeConfig } from "@/lib/convert";
import { publicRemoteConfigs } from "@/lib/remote-configs";
import { parseSiteLinks } from "@/lib/site-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const runtime = getRuntimeConfig();
  return NextResponse.json(
    {
      ...buildCapabilitiesPayload(),
      ekko_rules_version: runtime.ekkoRulesVersion,
      subconverter_version: runtime.subconverterVersion,
      deploy_mode: runtime.deployMode,
      stores_profiles: runtime.storedProfilesEnabled,
      remote_configs: publicRemoteConfigs(runtime.remoteConfigs),
      allow_custom_remote_config: runtime.allowCustomRemoteConfig,
      site_links: parseSiteLinks(process.env.SITE_LINKS),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
