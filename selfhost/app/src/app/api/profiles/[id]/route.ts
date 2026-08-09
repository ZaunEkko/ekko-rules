import { NextResponse } from "next/server";
import {
  authorizeLocalAccess,
  publicErrorMessage,
  safeLog,
} from "@/lib/convert";
import { deleteStoredProfile } from "@/lib/profiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    authorizeLocalAccess(request.headers.get("x-ekko-access-password") || undefined);
    const { id } = await context.params;
    await deleteStoredProfile(id);
    safeLog("profile.deleted");
    return new NextResponse(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = publicErrorMessage(error);
    const status = /password/i.test(message)
      ? 401
      : /not found/i.test(message)
        ? 404
        : 500;
    return NextResponse.json(
      { error: message },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
