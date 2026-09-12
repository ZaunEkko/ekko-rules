import { readFile } from "node:fs/promises";
import path from "node:path";
import { getRuntimeConfig } from "@/lib/convert";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The only two files the engine is ever handed. */
const HANDOFF_FILES = new Set(["subscription.input", "remote.ini"]);

const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Only the conversion engine on the Compose network may read a short-lived
 * input, and it reaches this route under the internal service name from
 * CONVERT_SHARED_URL_PREFIX (for example `web:3000`). A request that arrived
 * through the public front door carries the site's own host instead.
 *
 * Header presence is not a usable signal here: the engine itself forwards
 * proxy headers from the request that triggered the conversion.
 */
function hostnameOf(value: string): string {
  const trimmed = value.trim().toLowerCase();
  const bracketed = trimmed.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketed) return bracketed[1];
  return trimmed.split(":", 1)[0];
}

function isInternalRequestHost(request: Request, sharedUrlPrefix: string): boolean {
  const host = hostnameOf(request.headers.get("host") || "");
  if (!host) return false;
  let expected = "";
  try {
    expected = new URL(sharedUrlPrefix).hostname.toLowerCase();
  } catch {
    return false;
  }
  return Boolean(expected) && host === expected;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ requestId: string; filename: string }> },
) {
  const { requestId, filename } = await context.params;
  if (!REQUEST_ID_PATTERN.test(requestId) || !HANDOFF_FILES.has(filename)) {
    return new Response("Not found.", { status: 404 });
  }
  const runtimeConfig = getRuntimeConfig();
  if (
    runtimeConfig.deployMode === "public" &&
    !isInternalRequestHost(request, runtimeConfig.sharedUrlPrefix)
  ) {
    return new Response("Not found.", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  try {
    const body = await readFile(
      path.join(runtimeConfig.sharedDir, requestId, filename),
      "utf8",
    );
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found.", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
