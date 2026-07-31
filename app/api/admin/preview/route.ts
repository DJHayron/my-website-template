import { loadAdminConfig } from "@/lib/admin/config";
import { parseExistingArticleSlug } from "@/lib/admin/articles/slug";
import {
  AdminApiError,
  apiSuccess,
  readJsonBody,
  toApiErrorResponse,
} from "@/lib/admin/http";
import { isSameOriginRequest } from "@/lib/admin/origin";
import { previewArticleRequestSchema } from "@/lib/admin/schemas";
import { requireRequestSession } from "@/lib/admin/session";
import { markdownToHtml } from "@/lib/blog/markdown";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  try {
    const config = loadAdminConfig();

    if (!isSameOriginRequest(request, config.allowedOrigins)) {
      throw new AdminApiError(403, "invalid_origin", "要求來源未通過驗證。");
    }

    requireRequestSession(request, ["admin", "editor"], config);
    const body = await readJsonBody(request, previewArticleRequestSchema);
    const { slug } = parseExistingArticleSlug(body.slug);
    const html = await markdownToHtml(body.content, { slug });
    return apiSuccess({ html });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
