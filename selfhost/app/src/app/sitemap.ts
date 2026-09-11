import type { MetadataRoute } from "next";
import { getRuntimeConfig } from "@/lib/convert";

export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  const runtime = getRuntimeConfig();
  const origin = runtime.subscriptionBaseUrl;
  if (runtime.storedProfilesEnabled || !origin) return [];

  // One page, and it is the whole product.
  return [
    {
      url: `${origin}/`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
