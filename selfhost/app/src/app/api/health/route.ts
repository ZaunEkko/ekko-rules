import { NextResponse } from "next/server";
import { getRuntimeConfig } from "@/lib/convert";
import { readDetectedLanAddress } from "@/lib/host-network";
import { readMetrics } from "@/lib/metrics";
import {
  compareVersions,
  readLatestVersion,
  readRepoStars,
} from "@/lib/latest-version";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const runtimeConfig = getRuntimeConfig();
  const detectedLanAddress = await readDetectedLanAddress(
    runtimeConfig.hostNetworkInfoPath,
    runtimeConfig.webPort,
  );
  const metrics = runtimeConfig.metricsEnabled
    ? await readMetrics(runtimeConfig.profileDataDir)
    : null;
  const running = runtimeConfig.ekkoRulesVersion;
  const [{ latest: checkedLatest }, repoStars] = await Promise.all([
    readLatestVersion(),
    readRepoStars(),
  ]);
  // The running image was built from a published tag, so the newest published
  // version is at least the one running here. Reporting a smaller number would
  // print a running version ahead of "latest", which reads as a bug and tells
  // the visitor nothing true.
  const latestVersion =
    checkedLatest &&
    running !== "local" &&
    compareVersions(running, checkedLatest) > 0
      ? running
      : checkedLatest;
  // "local" is what an unbuilt image reports; it is not behind anything.
  const updateAvailable =
    Boolean(latestVersion) &&
    running !== "local" &&
    compareVersions(latestVersion as string, running) > 0;

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
      mode:
        runtimeConfig.deployMode === "public"
          ? "open-stateless-converter"
          : "personal-local-network",
      deploy_mode: runtimeConfig.deployMode,
      stores_profiles: runtimeConfig.storedProfilesEnabled,
      deployment_error: runtimeConfig.deploymentError || null,
      deployment_warning: runtimeConfig.deploymentWarning || null,
      ekko_rules_version: runtimeConfig.ekkoRulesVersion,
      latest_ekko_rules_version: latestVersion,
      update_available: updateAvailable,
      repo_stars: repoStars,
      subconverter_version: runtimeConfig.subconverterVersion,
      subconverter_reachable: subconverterReachable,
      access_password_required:
        runtimeConfig.deployMode !== "public" &&
        Boolean(runtimeConfig.accessPassword),
      lan_access_enabled: runtimeConfig.lanAccessEnabled,
      subscription_base_url: runtimeConfig.subscriptionBaseUrl || null,
      alt_origins: runtimeConfig.altOrigins,
      metrics: metrics
        ? {
            visits_today: metrics.visitsToday,
            visits_total: metrics.visitsTotal,
            conversions_today: metrics.conversionsToday,
            conversions_total: metrics.conversionsTotal,
          }
        : null,
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
