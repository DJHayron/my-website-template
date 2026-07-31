import type { AdminConfig } from "@/lib/admin/config";
import { loadAdminConfig } from "@/lib/admin/config";
import { AdminApiError } from "@/lib/admin/http";
import { verifySessionToken } from "@/lib/admin/jwt";
import type { AdminRole } from "@/types/admin";

export const ADMIN_SESSION_COOKIE = "admin_session";

function parseCookies(value: string | null) {
  const cookies = new Map<string, string>();

  value?.split(";").forEach((entry) => {
    const separatorIndex = entry.indexOf("=");

    if (separatorIndex < 1) {
      return;
    }

    const name = entry.slice(0, separatorIndex).trim();
    const cookieValue = entry.slice(separatorIndex + 1).trim();

    try {
      cookies.set(name, decodeURIComponent(cookieValue));
    } catch {
      // Ignore malformed cookie values and treat the request as unauthenticated.
    }
  });

  return cookies;
}

export function getSessionFromToken(token: string | undefined, config: AdminConfig) {
  return token ? verifySessionToken(token, config) : null;
}

export function getRequestSession(request: Request, config = loadAdminConfig()) {
  const token = parseCookies(request.headers.get("cookie")).get(ADMIN_SESSION_COOKIE);
  return getSessionFromToken(token, config);
}

export function requireRequestSession(
  request: Request,
  allowedRoles: readonly AdminRole[] = ["admin", "editor"],
  config = loadAdminConfig(),
) {
  const session = getRequestSession(request, config);

  if (!session) {
    throw new AdminApiError(401, "unauthorized", "請先登入後台。");
  }

  if (!allowedRoles.includes(session.user.role)) {
    throw new AdminApiError(403, "forbidden", "目前帳號沒有執行此操作的權限。");
  }

  return session;
}

export function getSessionCookieOptions(config: AdminConfig, expires: Date) {
  return {
    expires,
    httpOnly: true,
    name: ADMIN_SESSION_COOKIE,
    path: "/",
    sameSite: "strict" as const,
    secure: config.secureCookies,
  };
}

export function getExpiredSessionCookieOptions(config: AdminConfig) {
  return {
    expires: new Date(0),
    httpOnly: true,
    maxAge: 0,
    name: ADMIN_SESSION_COOKIE,
    path: "/",
    sameSite: "strict" as const,
    secure: config.secureCookies,
  };
}
