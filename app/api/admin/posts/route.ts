import { z } from "zod";
import { loadAdminConfig } from "@/lib/admin/config";
import { articleStore } from "@/lib/admin/articles/store";
import {
  AdminApiError,
  apiSuccess,
  readJsonBody,
  toApiErrorResponse,
} from "@/lib/admin/http";
import { isSameOriginRequest } from "@/lib/admin/origin";
import { createArticleRequestSchema } from "@/lib/admin/schemas";
import { requireRequestSession } from "@/lib/admin/session";
import { assertCmsWriteEnabled } from "@/lib/admin/write-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const listQuerySchema = z.object({
  query: z.string().trim().max(100).default(""),
  status: z.enum(["all", "draft", "published"]).default("all"),
});

export async function GET(request: Request) {
  try {
    const config = loadAdminConfig();
    requireRequestSession(request, ["admin", "editor"], config);
    const url = new URL(request.url);
    const query = listQuerySchema.safeParse({
      query: url.searchParams.get("q") ?? "",
      status: url.searchParams.get("status") ?? "all",
    });

    if (!query.success) {
      throw new AdminApiError(400, "invalid_query", "搜尋或篩選條件不正確。");
    }

    return apiSuccess({
      posts: await articleStore.list(query.data),
    });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const config = loadAdminConfig();

    if (!isSameOriginRequest(request, config.allowedOrigins)) {
      throw new AdminApiError(403, "invalid_origin", "要求來源未通過驗證。");
    }

    const session = requireRequestSession(request, ["admin", "editor"], config);
    assertCmsWriteEnabled(config);
    const body = await readJsonBody(request, createArticleRequestSchema);
    const { slug, ...articleInput } = body;
    const article = await articleStore.create(slug, articleInput, session.user.role);

    return apiSuccess({ article }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
