import "server-only";

import { cookies } from "next/headers";
import {
  AdminConfigurationError,
  loadAdminConfig,
} from "@/lib/admin/config";
import {
  ADMIN_SESSION_COOKIE,
  getSessionFromToken,
} from "@/lib/admin/session";

/**
 * Reads the admin session in a Server Component without making an internal
 * HTTP request. An unconfigured CMS is treated as signed out so the login
 * page can still explain the unavailable state through its normal API flow.
 */
export async function getServerAdminSession() {
  try {
    const config = loadAdminConfig();
    const cookieStore = await cookies();
    const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

    return getSessionFromToken(token, config);
  } catch (error) {
    if (error instanceof AdminConfigurationError) {
      return null;
    }

    throw error;
  }
}
