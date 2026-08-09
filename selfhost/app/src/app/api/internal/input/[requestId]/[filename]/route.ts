import { readFile } from "node:fs/promises";
import path from "node:path";
import { getRuntimeConfig } from "@/lib/convert";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  context: { params: Promise<{ requestId: string; filename: string }> },
) {
  const { requestId, filename } = await context.params;
  if (!REQUEST_ID_PATTERN.test(requestId) || filename !== "subscription.input") {
    return new Response("Not found.", { status: 404 });
  }

  try {
    const body = await readFile(
      path.join(getRuntimeConfig().sharedDir, requestId, filename),
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
