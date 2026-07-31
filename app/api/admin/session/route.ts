import { loadAdminConfig } from "@/lib/admin/config";
import { apiSuccess, toApiErrorResponse } from "@/lib/admin/http";
import { requireRequestSession } from "@/lib/admin/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const config = loadAdminConfig();
    const session = requireRequestSession(request, ["admin", "editor"], config);

    return apiSuccess({
      expiresAt: session.expiresAt.toISOString(),
      user: session.user,
    });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
