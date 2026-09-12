import { buildSiteCapabilities } from "@/lib/site-capabilities";
import { Workbench } from "./workbench";

// The two deployments render different pages, and which one this is only the
// server knows. Without this the client would have to guess until /api/health
// answered, and a visitor to the open station would watch the private
// workbench paint first.
export const dynamic = "force-dynamic";

export default function HomePage() {
  const capabilities = buildSiteCapabilities();
  return (
    <Workbench
      initialCapabilities={capabilities}
      initialStoresProfiles={capabilities.stores_profiles}
    />
  );
}
