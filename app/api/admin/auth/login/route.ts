import { loadAdminConfig, getConfiguredUser } from "@/lib/admin/config";
import {
  AdminApiError,
  apiSuccess,
  readJsonBody,
  toApiErrorResponse,
} from "@/lib/admin/http";
import { signSessionToken } from "@/lib/admin/jwt";
import {
  assertLoginAllowed,
  clearLoginFailures,
  getLoginAttemptBuckets,
  recordLoginFailure,
  withLoginHashSlot,
} from "@/lib/admin/login-limiter";
import { isSameOriginRequest } from "@/lib/admin/origin";
import { hashPassword, verifyPassword } from "@/lib/admin/password";
import { loginRequestSchema } from "@/lib/admin/schemas";
import { getSessionCookieOptions } from "@/lib/admin/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const config = loadAdminConfig();

    if (!isSameOriginRequest(request, config.allowedOrigins)) {
      throw new AdminApiError(403, "invalid_origin", "要求來源未通過驗證。");
    }

    const body = await readJsonBody(request, loginRequestSchema, 8 * 1024);
    const attemptBuckets = getLoginAttemptBuckets(
      request,
      body.username,
      config.trustProxyHeaders,
    );
    assertLoginAllowed(attemptBuckets);

    const user = getConfiguredUser(config, body.username);
    const passwordMatches = await withLoginHashSlot(async () => {
      if (user) {
        return verifyPassword(body.password, user.passwordHash);
      }

      await hashPassword(body.password.padEnd(12, "\0"), Buffer.alloc(16));
      return false;
    });

    if (!user || !passwordMatches) {
      recordLoginFailure(attemptBuckets);
      throw new AdminApiError(401, "invalid_credentials", "帳號或密碼不正確。");
    }

    clearLoginFailures(attemptBuckets);
    const token = signSessionToken(user, config);
    const expires = new Date(Date.now() + config.tokenTtlSeconds * 1_000);
    const response = apiSuccess({
      expiresAt: expires.toISOString(),
      user: {
        displayName: user.displayName,
        role: user.role,
        username: user.username,
      },
    });
    response.cookies.set({
      ...getSessionCookieOptions(config, expires),
      value: token,
    });

    return response;
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
