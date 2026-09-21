import { buildCapabilitiesPayload } from "./capabilities";
import { getRuntimeConfig } from "./convert";
import { publicRemoteConfigs } from "./remote-configs";
import { parseSiteLinks } from "./site-links";

/**
 * What the page needs to know before it can render its correct shape: which of
 * the two deployments this is, which configs are offered, which links go in the
 * header. The API route and the server-rendered page build it from here so the
 * first paint can never disagree with the first fetch.
 *
 * Server only — it reads the runtime environment.
 */
export function buildSiteCapabilities() {
  const runtime = getRuntimeConfig();
  return {
    ...buildCapabilitiesPayload(),
    site_version: runtime.siteVersion,
    subconverter_version: runtime.subconverterVersion,
    deploy_mode: runtime.deployMode,
    stores_profiles: runtime.storedProfilesEnabled,
    remote_configs: publicRemoteConfigs(runtime.remoteConfigs),
    allow_custom_remote_config: runtime.allowCustomRemoteConfig,
    site_links: parseSiteLinks(process.env.SITE_LINKS),
  };
}
