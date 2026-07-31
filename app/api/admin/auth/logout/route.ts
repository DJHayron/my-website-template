import { loadAdminConfig } from "@/lib/admin/config";
import { AdminApiError, apiSuccess, toApiErrorResponse } from "@/lib/admin/http";
import { isSameOriginRequest } from "@/lib/admin/origin";
import {
  getExpiredSessionCookieOptions,
  requireRequestSession,
} from "@/lib/admin/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const config = loadAdminConfig();

    if (!isSameOriginRequest(request, config.allowedOrigins)) {
      throw new AdminApiError(403, "invalid_origin", "要求來源未通過驗證。");
    }

    requireRequestSession(request, ["admin", "editor"], config);
    const response = apiSuccess({ loggedOut: true });
    response.cookies.set({
      ...getExpiredSessionCookieOptions(config),
      value: "",
    });
    return response;
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
