import { NextResponse } from "next/server";
import { getRuntimeConfig } from "@/lib/convert";
import { readDetectedLanAddress } from "@/lib/host-network";
import { readMetrics } from "@/lib/metrics";
import {
  compareVersions,
  readLatestVersion,
  readRepoStars,
} from "@/lib/latest-version";
import { readEngineRulesVersion } from "@/lib/rules-version";

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
  const runningSite = runtimeConfig.siteVersion;
  const [{ site: checkedSite, rules: checkedRules }, repoStars, engineRules] =
    await Promise.all([
      readLatestVersion(),
      readRepoStars(),
      // The engine answers for its own rules; this image cannot, now that the
      // two are released apart.
      readEngineRulesVersion(runtimeConfig.subconverterBaseUrl),
    ]);
  const runningRules = engineRules?.version ?? null;

  /**
   * A running image was built from a published tag, so the newest published
   * release is at least the one running here. Reporting a smaller number
   * would print a running version ahead of "latest", which reads as a bug and
   * tells the visitor nothing true. "local" is an unbuilt image: it is not
   * behind anything.
   */
  const reconcile = (running: string | null, checked: string | null) => {
    if (!running || running === "local") {
      return { latest: checked, updateAvailable: false };
    }
    const latest =
      checked && compareVersions(running, checked) > 0 ? running : checked;
    return {
      latest,
      updateAvailable: Boolean(latest) && compareVersions(latest as string, running) > 0,
    };
  };

  const site = reconcile(runningSite, checkedSite);
  const rules = reconcile(runningRules, checkedRules);

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
      // Two release lines, reported apart: a site release says nothing about
      // the rules, and the page must stop implying that it does.
      site_version: runningSite,
      latest_site_version: site.latest,
      site_update_available: site.updateAvailable,
      rules_version: runningRules,
      rules_built: engineRules?.built || null,
      latest_rules_version: rules.latest,
      rules_update_available: rules.updateAvailable,
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
