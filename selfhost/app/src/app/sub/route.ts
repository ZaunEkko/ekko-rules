import { serveStatelessSubscription } from "@/lib/stateless-subscription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stateless subscription entry: everything needed for the conversion comes
 * from the query string, and nothing about the request is stored.
 */
export async function GET(request: Request) {
  return serveStatelessSubscription(request);
}
