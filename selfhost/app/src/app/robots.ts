import type { MetadataRoute } from "next";
import { getRuntimeConfig } from "@/lib/convert";

export const dynamic = "force-dynamic";

/**
 * An open deployment wants to be found; a personal one must not be. The engine
 * handoff route is never useful to a crawler in either case.
 */
export default function robots(): MetadataRoute.Robots {
  const runtime = getRuntimeConfig();
  const origin = runtime.subscriptionBaseUrl;

  if (runtime.storedProfilesEnabled) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // A crawler following a generated link would only burn upstream requests
      // on someone else's subscription.
      disallow: ["/api/", "/sub"],
    },
    ...(origin ? { sitemap: `${origin}/sitemap.xml`, host: origin } : {}),
  };
}
