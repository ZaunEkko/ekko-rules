import { handleImportRequest } from "@/lib/import-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handleImportRequest;
